import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useJobs } from "./useJobs";

const mockJob = {
  id: "job-1",
  name: "Daily sync",
  cronExpression: "0 9 * * *",
  skillName: "sprint-sync",
  enabled: true,
  lastRunAt: null,
  lastResultSummary: null,
};

const mockJob2 = {
  id: "job-2",
  name: "Nightly report",
  cronExpression: "0 0 * * *",
  skillName: "report",
  enabled: false,
  lastRunAt: "2026-04-08T00:00:00.000Z",
  lastResultSummary: "OK",
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("useJobs", () => {
  it("loads jobs on mount", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => [mockJob],
    } as Response);

    const { result } = renderHook(() => useJobs());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.jobs).toEqual([mockJob]);
    expect(result.current.error).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/api/jobs", expect.objectContaining({}));
  });

  it("sets error when load fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error("no json"); },
    } as unknown as Response);

    const { result } = renderHook(() => useJobs());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Request failed (500)");
    expect(result.current.jobs).toEqual([]);
  });

  it("sets error on network failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useJobs());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Network error");
    expect(result.current.jobs).toEqual([]);
  });

  it("creates a job and appends it to the list", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockJob,
      } as Response);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created;
    await act(async () => {
      created = await result.current.createJob({
        name: "Daily sync",
        cronExpression: "0 9 * * *",
        skillName: "sprint-sync",
      });
    });

    expect(created).toEqual(mockJob);
    expect(result.current.jobs).toEqual([mockJob]);
    expect(fetch).toHaveBeenCalledWith("/api/jobs", expect.objectContaining({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Daily sync",
        cronExpression: "0 9 * * *",
        skillName: "sprint-sync",
      }),
    }));
  });

  it("sets error when create fails with error body", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: "Invalid cron expression" }),
      } as Response);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created;
    await act(async () => {
      created = await result.current.createJob({
        name: "Bad job",
        cronExpression: "invalid",
        skillName: "sync",
      });
    });

    expect(created).toBeNull();
    expect(result.current.error).toBe("Invalid cron expression");
  });

  it("sets fallback error when create fails without error body", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error("parse error"); },
      } as unknown as Response);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let created;
    await act(async () => {
      created = await result.current.createJob({
        name: "Bad job",
        cronExpression: "invalid",
        skillName: "sync",
      });
    });

    expect(created).toBeNull();
    expect(result.current.error).toBe("Request failed (500)");
  });

  it("updates a job optimistically", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockJob],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockJob, name: "Updated sync" }),
      } as Response);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));

    let updated;
    await act(async () => {
      updated = await result.current.updateJob("job-1", { name: "Updated sync" });
    });

    expect(updated).toEqual({ ...mockJob, name: "Updated sync" });
    expect(result.current.jobs[0].name).toBe("Updated sync");
    expect(fetch).toHaveBeenCalledWith("/api/jobs/job-1", expect.objectContaining({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated sync" }),
    }));
  });

  it("sets error on failed update", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockJob],
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error("no json"); },
      } as unknown as Response);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));

    let updated;
    await act(async () => {
      updated = await result.current.updateJob("job-1", { name: "Bad update" });
    });

    expect(updated).toBeNull();
    expect(result.current.error).toBe("Request failed (500)");
  });

  it("deletes a job optimistically", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockJob, mockJob2],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.jobs).toHaveLength(2));

    let deleted;
    await act(async () => {
      deleted = await result.current.deleteJob("job-1");
    });

    expect(deleted).toBe(true);
    expect(result.current.jobs).toEqual([mockJob2]);
    expect(fetch).toHaveBeenCalledWith("/api/jobs/job-1", expect.objectContaining({
      method: "DELETE",
    }));
  });

  it("sets error on failed delete", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockJob],
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error("no json"); },
      } as unknown as Response);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));

    let deleted;
    await act(async () => {
      deleted = await result.current.deleteJob("job-1");
    });

    expect(deleted).toBe(false);
    expect(result.current.error).toBe("Request failed (500)");
  });

  it("refresh re-fetches jobs", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockJob],
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [mockJob, mockJob2],
      } as Response);

    const { result } = renderHook(() => useJobs());
    await waitFor(() => expect(result.current.jobs).toHaveLength(1));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.jobs).toEqual([mockJob, mockJob2]);
  });
});
