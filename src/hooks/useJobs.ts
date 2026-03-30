"use client";

import { useState, useEffect, useCallback } from "react";
import type { ScheduledJob } from "@/db/schema";

interface CreateJobPayload {
  name: string;
  cronExpression: string;
  skillName: string;
}

interface UseJobsReturn {
  jobs: ScheduledJob[];
  loading: boolean;
  error: string | null;
  createJob: (payload: CreateJobPayload) => Promise<ScheduledJob | null>;
  updateJob: (id: string, updates: Partial<ScheduledJob>) => Promise<ScheduledJob | null>;
  deleteJob: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useJobs(): UseJobsReturn {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs");
      if (!res.ok) throw new Error("Failed to load jobs");
      setJobs(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const createJob = useCallback(async (payload: CreateJobPayload): Promise<ScheduledJob | null> => {
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to create job");
      }
      const job: ScheduledJob = await res.json();
      setJobs((prev) => [...prev, job]);
      return job;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    }
  }, []);

  const updateJob = useCallback(
    async (id: string, updates: Partial<ScheduledJob>): Promise<ScheduledJob | null> => {
      setError(null);
      // Optimistic update
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...updates } : j)));
      try {
        const res = await fetch(`/api/jobs/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (!res.ok) {
          await fetchJobs();
          throw new Error("Failed to update job");
        }
        const updated: ScheduledJob = await res.json();
        setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return null;
      }
    },
    [fetchJobs],
  );

  const deleteJob = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      // Optimistic removal
      setJobs((prev) => prev.filter((j) => j.id !== id));
      try {
        const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
        if (!res.ok) {
          await fetchJobs();
          throw new Error("Failed to delete job");
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [fetchJobs],
  );

  return { jobs, loading, error, createJob, updateJob, deleteJob, refresh: fetchJobs };
}
