"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/shared/TextInput";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataErrorState } from "@/components/shared/DataErrorState";
import { deprecatedAreas, type DeprecatedAreaItem } from "@/lib/api-client";

/**
 * Manage the editable deprecated-area keyword list (BRDG-285). The "replaced
 * area" deep-scan topic matches backlog ticket text against these rows, so the
 * PO grows the list here over time. Mirrors the Quick Prompts settings page.
 */
export default function DeprecatedAreasPage() {
  const [areas, setAreas] = useState<DeprecatedAreaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ term: "", aliases: "", note: "" });

  const loadAreas = useCallback((signal?: AbortSignal) => {
    setLoading(true);
    deprecatedAreas
      .list(signal)
      .then((data) => {
        setAreas(data.areas);
        setError(null);
      })
      .catch((err) => {
        // Ignore unmount aborts; surface real failures instead of a silent empty
        // list that looks like a valid "no areas yet" state (BRDG-423).
        if (err?.name === "AbortError") return;
        setError(err);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadAreas(controller.signal);
    return () => controller.abort();
  }, [loadAreas]);

  const add = useCallback(async () => {
    const term = draft.term.trim();
    if (!term || busy) return;
    setBusy(true);
    try {
      const { area } = await deprecatedAreas.add({
        term,
        aliases: draft.aliases.trim(),
        note: draft.note.trim(),
      });
      setAreas((prev) => [...prev, area].sort((a, b) => a.term.localeCompare(b.term)));
      setDraft({ term: "", aliases: "", note: "" });
    } finally {
      setBusy(false);
    }
  }, [draft, busy]);

  const remove = useCallback(async (id: string) => {
    setAreas((prev) => prev.filter((a) => a.id !== id));
    try {
      await deprecatedAreas.remove(id);
    } catch {
      // Reload on failure so the UI reflects the true server state.
      const data = await deprecatedAreas.list();
      setAreas(data.areas);
    }
  }, []);

  return (
    <>
      <div className="mb-5">
        <h2 className="text-body-sm font-medium text-text-secondary uppercase tracking-[0.06em]">
          Deprecated Areas
        </h2>
        <p className="text-body-sm text-text-tertiary mt-2 leading-[1.7]">
          Retired product or tech areas. The backlog deep scan flags tickets that are about one of
          these as likely obsolete. Add a term plus any alternate spellings (comma-separated).
        </p>
      </div>

      {error ? (
        <DataErrorState variant="full" error={error} onRetry={() => loadAreas()} className="py-12" />
      ) : loading ? (
        <LoadingState className="py-12" />
      ) : (
        <div className="flex flex-col gap-3">
          {areas.length === 0 && (
            <EmptyState title="No deprecated areas yet" className="py-6" />
          )}

          {areas.map((area) => (
            <DeprecatedAreaRow
              key={area.id}
              area={area}
              onRemove={remove}
              onSaved={(updated) =>
                setAreas((prev) =>
                  prev
                    .map((a) => (a.id === updated.id ? updated : a))
                    .sort((a, b) => a.term.localeCompare(b.term))
                )
              }
            />
          ))}

          <div className="rounded-xl border border-dashed border-border-default bg-overlay-subtle/50 p-4 flex flex-col gap-3 mt-1">
            <div className="flex items-center gap-2">
              <TextInput
                value={draft.term}
                onChange={(e) => setDraft((d) => ({ ...d, term: e.target.value }))}
                placeholder="Area / keyword (e.g. RezExchange)"
                className="w-56"
                onKeyDown={(e) => {
                  if (e.key === "Enter") add();
                }}
              />
              <TextInput
                value={draft.aliases}
                onChange={(e) => setDraft((d) => ({ ...d, aliases: e.target.value }))}
                placeholder="Aliases (comma-separated)"
                className="flex-1"
              />
            </div>
            <TextInput
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Note (optional)"
            />
            <Button
              variant="soft"
              size="md"
              icon={<Plus size={14} strokeWidth={1.5} />}
              onClick={add}
              disabled={busy || draft.term.trim().length === 0}
              className="self-start"
            >
              Add area
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function DeprecatedAreaRow({
  area,
  onRemove,
  onSaved,
}: {
  area: DeprecatedAreaItem;
  onRemove: (id: string) => void;
  onSaved: (area: DeprecatedAreaItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ term: area.term, aliases: area.aliases, note: area.note });
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    const term = form.term.trim();
    if (!term || saving) return;
    setSaving(true);
    try {
      const { area: updated } = await deprecatedAreas.update({
        id: area.id,
        term,
        aliases: form.aliases.trim(),
        note: form.note.trim(),
      });
      onSaved(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [form, area.id, onSaved, saving]);

  if (editing) {
    return (
      <div className="rounded-xl border border-border-default bg-overlay-subtle p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <TextInput
            value={form.term}
            onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))}
            placeholder="Area / keyword"
            className="w-56"
          />
          <TextInput
            value={form.aliases}
            onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))}
            placeholder="Aliases (comma-separated)"
            className="flex-1"
          />
          <Button
            variant="soft"
            size="md"
            iconOnly
            icon={<Check size={14} strokeWidth={1.5} />}
            onClick={save}
            disabled={saving || form.term.trim().length === 0}
            aria-label="Save area"
          />
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={<X size={14} strokeWidth={1.5} />}
            onClick={() => {
              setForm({ term: area.term, aliases: area.aliases, note: area.note });
              setEditing(false);
            }}
            aria-label="Cancel edit"
          />
        </div>
        <TextInput
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          placeholder="Note (optional)"
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-default bg-overlay-subtle p-4 flex items-start gap-3">
      <button
        onClick={() => setEditing(true)}
        className="flex-1 text-left cursor-pointer group"
        aria-label={`Edit ${area.term}`}
      >
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-body-lg font-medium text-text-primary group-hover:text-[var(--color-brand-400)] transition-colors duration-150">
            {area.term}
          </span>
          {area.aliases && (
            <span className="text-body-sm text-text-tertiary">aka {area.aliases}</span>
          )}
        </div>
        {area.note && (
          <p className="text-body-sm text-text-tertiary mt-1 leading-[1.6]">{area.note}</p>
        )}
      </button>
      <Button
        variant="destructive"
        size="md"
        iconOnly
        icon={<Trash2 size={14} strokeWidth={1.5} />}
        onClick={() => onRemove(area.id)}
        aria-label={`Remove ${area.term}`}
      />
    </div>
  );
}
