import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api"
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("climate_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export type User = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export type Dataset = {
  id: number;
  name: string;
  description: string;
  file_name: string;
  file_type: string;
  uploaded_by: string;
  created_at: string;
};

export type Project = {
  id: number;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  member_count: number;
};