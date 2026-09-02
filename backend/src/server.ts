
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import { Pool } from "pg";
import { createClient } from "redis";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || "development_secret";

/* =========================
   DATABASE
========================= */

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://climate_user:climate_password@localhost:5432/climate_hub"
});

pool.on("error", (err) => {
  console.error("POSTGRES POOL ERROR:", err);
});

/* =========================
   REDIS
========================= */

const redis = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379"
});

redis.on("error", (err) => {
  console.error("REDIS ERROR:", err);
});

redis
  .connect()
  .then(() => {
    console.log("Redis connected");
  })
  .catch((err) => {
    console.error("Redis connection failed:", err);
  });

/* =========================
   MIDDLEWARE
========================= */

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173"
  })
);

app.use(express.json());

/* =========================
   UPLOADS
========================= */

const uploadDir = path.join(process.cwd(), "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: uploadDir,

  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 20 * 1024 * 1024
  },

  fileFilter: (_req, file, cb) => {
    const allowed = [".csv", ".json", ".txt"];

    cb(
      null,
      allowed.includes(
        path.extname(file.originalname).toLowerCase()
      )
    );
  }
});

/* =========================
   TYPES
========================= */

type AuthRequest = express.Request & {
  user?: {
    id: number;
    name: string;
    email: string;
    role: string;
  };
};

/* =========================
   JWT
========================= */

function signToken(user: {
  id: number;
  name: string;
  email: string;
  role: string;
}) {
  return jwt.sign(user, JWT_SECRET, {
    expiresIn: "7d"
  });
}

/* =========================
   AUTH MIDDLEWARE
========================= */

function auth(
  req: AuthRequest,
  res: express.Response,
  next: express.NextFunction
) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication required"
    });
  }

  try {
    req.user = jwt.verify(
      header.substring(7),
      JWT_SECRET
    ) as AuthRequest["user"];

    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
}

/* =========================
   CSV PARSER
========================= */

function parseCsv(content: string) {
  const lines = content
    .split(/\r?\n/)
    .filter(Boolean);

  if (!lines.length) {
    return {
      headers: [],
      rows: [] as Record<string, string>[]
    };
  }

  const headers = lines[0]
    .split(",")
    .map((x) => x.trim());

  const rows = lines.slice(1).map((line) => {
    const values = line.split(",");

    return Object.fromEntries(
      headers.map((h, i) => [
        h,
        (values[i] || "").trim()
      ])
    );
  });

  return {
    headers,
    rows
  };
}

/* =========================
   HEALTH CHECK
========================= */

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Climate Research API"
  });
});

/* =========================
   REGISTER
========================= */

app.post("/api/auth/register", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role = "RESEARCHER"
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message:
          "Name, email and password are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message:
          "Password must be at least 6 characters"
      });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users
       (name,email,password_hash,role)
       VALUES($1,$2,$3,$4)
       RETURNING id,name,email,role`,
      [
        name,
        email.toLowerCase(),
        hash,
        role
      ]
    );

    const user = result.rows[0];

    res.status(201).json({
      user,
      token: signToken(user)
    });

  } catch (e: any) {

    console.error(
      "REGISTRATION ERROR:",
      e
    );

    if (e.code === "23505") {
      return res.status(409).json({
        message: "Email already registered"
      });
    }

    res.status(500).json({
      message: "Registration failed"
    });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/api/auth/login", async (req, res) => {
  try {

    const { email, password } = req.body;

    console.log(
      "LOGIN REQUEST:",
      email ? String(email).toLowerCase() : "NO EMAIL"
    );

    const result = await pool.query(
      "SELECT * FROM users WHERE email=$1",
      [
        String(email || "").toLowerCase()
      ]
    );

    console.log(
      "LOGIN USER FOUND:",
      result.rows.length > 0
    );

    const user = result.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(
        password || "",
        user.password_hash
      ))
    ) {
      console.log(
        "LOGIN FAILED: invalid credentials"
      );

      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const safe = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    console.log(
      "LOGIN SUCCESS:",
      safe.email
    );

    res.json({
      user: safe,
      token: signToken(safe)
    });

  } catch (e) {

    console.error(
      "LOGIN ERROR:",
      e
    );

    res.status(500).json({
      message: "Login failed"
    });
  }
});

/* =========================
   PROFILE
========================= */

app.get(
  "/api/auth/profile",
  auth,
  (req: AuthRequest, res) => {

    res.json({
      user: req.user
    });
  }
);

/* =========================
   DATASETS
========================= */

app.get(
  "/api/datasets",
  auth,
  async (req, res) => {

    try {

      const search = String(
        req.query.search || ""
      );

      const result = await pool.query(
        `SELECT
          d.id,
          d.name,
          d.description,
          d.file_name,
          d.file_type,
          d.created_at,
          u.name AS uploaded_by
         FROM datasets d
         LEFT JOIN users u
         ON d.uploaded_by=u.id
         WHERE d.name ILIKE $1
         OR d.description ILIKE $1
         ORDER BY d.created_at DESC`,
        [`%${search}%`]
      );

      res.json({
        datasets: result.rows
      });

    } catch (e) {

      console.error(
        "FETCH DATASETS ERROR:",
        e
      );

      res.status(500).json({
        message: "Could not fetch datasets"
      });
    }
  }
);

/* =========================
   UPLOAD DATASET
========================= */

app.post(
  "/api/datasets",
  auth,
  upload.single("file"),
  async (req: AuthRequest, res) => {

    try {

      if (!req.file) {
        return res.status(400).json({
          message:
            "CSV, JSON or TXT file is required"
        });
      }

      const {
        name,
        description = ""
      } = req.body;

      const result = await pool.query(
        `INSERT INTO datasets
        (
          name,
          description,
          file_name,
          file_path,
          file_type,
          uploaded_by
        )
        VALUES($1,$2,$3,$4,$5,$6)
        RETURNING *`,
        [
          name || req.file.originalname,
          description,
          req.file.originalname,
          req.file.path,
          path
            .extname(req.file.originalname)
            .substring(1),
          req.user!.id
        ]
      );

      await redis.del(
        "dashboard:stats"
      );

      res.status(201).json({
        dataset: result.rows[0]
      });

    } catch (e) {

      console.error(
        "DATASET UPLOAD ERROR:",
        e
      );

      res.status(500).json({
        message: "Dataset upload failed"
      });
    }
  }
);

/* =========================
   GET DATASET
========================= */

app.get(
  "/api/datasets/:id",
  auth,
  async (req, res) => {

    try {

      const result = await pool.query(
        `SELECT
          d.*,
          u.name AS uploaded_by
         FROM datasets d
         LEFT JOIN users u
         ON d.uploaded_by=u.id
         WHERE d.id=$1`,
        [req.params.id]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          message: "Dataset not found"
        });
      }

      res.json({
        dataset: result.rows[0]
      });

    } catch (e) {

      console.error(
        "GET DATASET ERROR:",
        e
      );

      res.status(500).json({
        message: "Could not fetch dataset"
      });
    }
  }
);

/* =========================
   DATASET ANALYTICS
========================= */

app.get(
  "/api/datasets/:id/analytics",
  auth,
  async (req, res) => {

    try {

      const result = await pool.query(
        "SELECT * FROM datasets WHERE id=$1",
        [req.params.id]
      );

      const dataset = result.rows[0];

      if (!dataset) {
        return res.status(404).json({
          message: "Dataset not found"
        });
      }

      const content = fs.readFileSync(
        dataset.file_path,
        "utf8"
      );

      if (dataset.file_type !== "csv") {
        return res.json({
          type: dataset.file_type,
          rows: [],
          message:
            "Analytics preview currently supports CSV files."
        });
      }

      const parsed = parseCsv(content);

      const numericColumns =
        parsed.headers.filter((h) =>
          parsed.rows.some(
            (r) =>
              r[h] !== "" &&
              !Number.isNaN(Number(r[h]))
          )
        );

      const statistics =
        numericColumns.map((column) => {

          const values = parsed.rows
            .map((r) => Number(r[column]))
            .filter(Number.isFinite);

          const average = values.length
            ? values.reduce(
                (a, b) => a + b,
                0
              ) / values.length
            : 0;

          return {
            column,
            count: values.length,
            average: Number(
              average.toFixed(2)
            ),
            minimum: values.length
              ? Math.min(...values)
              : 0,
            maximum: values.length
              ? Math.max(...values)
              : 0
          };
        });

      res.json({
        rows: parsed.rows.slice(0, 100),
        headers: parsed.headers,
        rowCount: parsed.rows.length,
        numericColumns,
        statistics
      });

    } catch (e) {

      console.error(
        "ANALYTICS ERROR:",
        e
      );

      res.status(500).json({
        message:
          "Analytics generation failed"
      });
    }
  }
);

/* =========================
   DELETE DATASET
========================= */

app.delete(
  "/api/datasets/:id",
  auth,
  async (req: AuthRequest, res) => {

    try {

      const result = await pool.query(
        "SELECT file_path,uploaded_by FROM datasets WHERE id=$1",
        [req.params.id]
      );

      if (!result.rows[0]) {
        return res.status(404).json({
          message: "Dataset not found"
        });
      }

      if (
        result.rows[0].uploaded_by !==
          req.user!.id &&
        req.user!.role !== "ADMIN"
      ) {
        return res.status(403).json({
          message:
            "You can delete only your own dataset"
        });
      }

      try {
        fs.unlinkSync(
          result.rows[0].file_path
        );
      } catch {}

      await pool.query(
        "DELETE FROM datasets WHERE id=$1",
        [req.params.id]
      );

      await redis.del(
        "dashboard:stats"
      );

      res.json({
        message: "Dataset deleted"
      });

    } catch (e) {

      console.error(
        "DELETE DATASET ERROR:",
        e
      );

      res.status(500).json({
        message: "Delete failed"
      });
    }
  }
);

/* =========================
   PROJECTS
========================= */

app.get(
  "/api/projects",
  auth,
  async (_req, res) => {

    try {

      const result = await pool.query(
        `SELECT
          p.id,
          p.name,
          p.description,
          p.created_at,
          u.name AS created_by,
          (
            SELECT COUNT(*)
            FROM project_members pm
            WHERE pm.project_id=p.id
          ) AS member_count
         FROM projects p
         LEFT JOIN users u
         ON p.created_by=u.id
         ORDER BY p.created_at DESC`
      );

      res.json({
        projects: result.rows
      });

    } catch (e) {

      console.error(
        "FETCH PROJECTS ERROR:",
        e
      );

      res.status(500).json({
        message: "Could not fetch projects"
      });
    }
  }
);

/* =========================
   CREATE PROJECT
========================= */

app.post(
  "/api/projects",
  auth,
  async (req: AuthRequest, res) => {

    try {

      const {
        name,
        description = ""
      } = req.body;

      if (!name) {
        return res.status(400).json({
          message:
            "Project name is required"
        });
      }

      const result = await pool.query(
        `INSERT INTO projects
        (name,description,created_by)
        VALUES($1,$2,$3)
        RETURNING *`,
        [
          name,
          description,
          req.user!.id
        ]
      );

      await pool.query(
        `INSERT INTO project_members
        (project_id,user_id,member_role)
        VALUES($1,$2,'OWNER')
        ON CONFLICT DO NOTHING`,
        [
          result.rows[0].id,
          req.user!.id
        ]
      );

      await redis.del(
        "dashboard:stats"
      );

      res.status(201).json({
        project: result.rows[0]
      });

    } catch (e) {

      console.error(
        "PROJECT CREATION ERROR:",
        e
      );

      res.status(500).json({
        message:
          "Project creation failed"
      });
    }
  }
);

/* =========================
   ADD PROJECT MEMBER
========================= */

app.post(
  "/api/projects/:id/members",
  auth,
  async (req: AuthRequest, res) => {

    try {

      const { email } = req.body;

      const user = await pool.query(
        "SELECT id FROM users WHERE email=$1",
        [
          String(email || "")
            .toLowerCase()
        ]
      );

      if (!user.rows[0]) {
        return res.status(404).json({
          message: "User not found"
        });
      }

      await pool.query(
        `INSERT INTO project_members
        (project_id,user_id)
        VALUES($1,$2)
        ON CONFLICT DO NOTHING`,
        [
          req.params.id,
          user.rows[0].id
        ]
      );

      res.json({
        message: "Member added"
      });

    } catch (e) {

      console.error(
        "ADD MEMBER ERROR:",
        e
      );

      res.status(500).json({
        message:
          "Could not add member"
      });
    }
  }
);

/* =========================
   DASHBOARD STATS
========================= */

app.get(
  "/api/dashboard/stats",
  auth,
  async (_req, res) => {

    try {

      const cached = await redis.get(
        "dashboard:stats"
      );

      if (cached) {
        return res.json({
          ...JSON.parse(cached),
          cached: true
        });
      }

      const [
        datasets,
        projects,
        users,
        outputs
      ] = await Promise.all([

        pool.query(
          "SELECT COUNT(*)::int AS count FROM datasets"
        ),

        pool.query(
          "SELECT COUNT(*)::int AS count FROM projects"
        ),

        pool.query(
          "SELECT COUNT(*)::int AS count FROM users"
        ),

        pool.query(
          "SELECT COUNT(*)::int AS count FROM research_outputs"
        )

      ]);

      const data = {
        datasets:
          datasets.rows[0].count,

        projects:
          projects.rows[0].count,

        researchers:
          users.rows[0].count,

        researchOutputs:
          outputs.rows[0].count
      };

      await redis.setEx(
        "dashboard:stats",
        60,
        JSON.stringify(data)
      );

      res.json({
        ...data,
        cached: false
      });

    } catch (e) {

      console.error(
        "DASHBOARD ERROR:",
        e
      );

      res.status(500).json({
        message:
          "Could not load dashboard statistics"
      });
    }
  }
);

/* =========================
   RESEARCH OUTPUTS
========================= */

app.get(
  "/api/projects/:id/outputs",
  auth,
  async (req, res) => {

    try {

      const result = await pool.query(
        `SELECT *
         FROM research_outputs
         WHERE project_id=$1
         ORDER BY created_at DESC`,
        [req.params.id]
      );

      res.json({
        outputs: result.rows
      });

    } catch (e) {

      console.error(
        "FETCH OUTPUTS ERROR:",
        e
      );

      res.status(500).json({
        message:
          "Could not fetch research outputs"
      });
    }
  }
);

/* =========================
   CREATE RESEARCH OUTPUT
========================= */

app.post(
  "/api/projects/:id/outputs",
  auth,
  async (req, res) => {

    try {

      const {
        title,
        description = "",
        file_path = null
      } = req.body;

      if (!title) {
        return res.status(400).json({
          message:
            "Output title is required"
        });
      }

      const result = await pool.query(
        `INSERT INTO research_outputs
        (
          project_id,
          title,
          description,
          file_path
        )
        VALUES($1,$2,$3,$4)
        RETURNING *`,
        [
          req.params.id,
          title,
          description,
          file_path
        ]
      );

      await redis.del(
        "dashboard:stats"
      );

      res.status(201).json({
        output: result.rows[0]
      });

    } catch (e) {

      console.error(
        "CREATE OUTPUT ERROR:",
        e
      );

      res.status(500).json({
        message:
          "Could not create research output"
      });
    }
  }
);

/* =========================
   GLOBAL ERROR HANDLER
========================= */

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {

    console.error(
      "GLOBAL SERVER ERROR:",
      err
    );

    res.status(500).json({
      message:
        err.message || "Server error"
    });
  }
);

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {

  console.log(
    `Climate Research API running on http://localhost:${PORT}`
  );

});
