import axios from "axios";

const backendBaseUrl = import.meta.env.VITE_BACKEND_BASE_URL ?? "http://localhost:4000/v1";

export const apiClient = axios.create({
  baseURL: backendBaseUrl,
  timeout: 8000
});
