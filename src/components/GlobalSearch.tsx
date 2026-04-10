"use client";

import { useState, useEffect, useCallback } from "react";
import { SearchModal } from "@/components/sprint-board/SearchModal";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new Event("valk:closePalette"));
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    function onOpen() { setOpen(true); }
    window.addEventListener("valk:openGlobalSearch", onOpen);
    return () => window.removeEventListener("valk:openGlobalSearch", onOpen);
  }, []);

  useEffect(() => {
    function onClose() { setOpen(false); }
    window.addEventListener("valk:closeGlobalSearch", onClose);
    return () => window.removeEventListener("valk:closeGlobalSearch", onClose);
  }, []);

  return (
    <SearchModal
      open={open}
      onClose={handleClose}
      onSelectTicket={() => {}}
    />
  );
}
