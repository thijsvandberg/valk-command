"use client";

import { useState, useEffect, useCallback } from "react";
import type { ScheduledJob } from "@/db/schema";
import { jobs as jobsApi, ApiError } from "@/lib/api-client";

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
      const data = await jobsApi.list() as ScheduledJob[];
      setJobs(data);
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
      const job = await jobsApi.create(payload as unknown as Record<string, unknown>) as ScheduledJob;
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
        const updated = await jobsApi.update(id, updates) as ScheduledJob;
        setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return null;
      }
    },
    [],
  );

  const deleteJob = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      // Optimistic removal
      setJobs((prev) => prev.filter((j) => j.id !== id));
      try {
        await jobsApi.delete(id);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      }
    },
    [],
  );

  return { jobs, loading, error, createJob, updateJob, deleteJob, refresh: fetchJobs };
}
