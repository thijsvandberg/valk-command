"use client";

import { RefreshCw } from "lucide-react";
import type { StakeholderSprint, StakeholderTicket } from "@/lib/stakeholder-data";
import type { Ticket } from "@/types/ticket";
import { SprintOverviewCard } from "./SprintOverviewCard";
import { SprintHealthBanner } from "./SprintHealthBanner";
import { VelocitySparkline } from "./VelocitySparkline";
import { LoadingState } from "@/components/shared/LoadingState";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataErrorState } from "@/components/shared/DataErrorState";
import type { VelocityPoint } from "@/hooks/useVelocityData";

export interface StakeholderSprintCardsProps {
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  rawTickets: Ticket[] | undefined;
  stakeholderSprint: StakeholderSprint | null;
  isCompareMode: boolean;
  prevStakeholderSprint: StakeholderSprint | null;
  isPrevLoading: boolean;
  carriedKeys: Set<string>;
  isCarryOverLoading: boolean;
  previousSprint: { name: string } | null;
  doneTickets: StakeholderTicket[];
  inReviewTickets: StakeholderTicket[];
  inProgressTickets: StakeholderTicket[];
  todoTickets: StakeholderTicket[];
  deprecatedTickets: StakeholderTicket[];
  prevDoneTickets: StakeholderTicket[];
  prevInReviewTickets: StakeholderTicket[];
  prevInProgressTickets: StakeholderTicket[];
  prevTodoTickets: StakeholderTicket[];
  prevDeprecatedTickets: StakeholderTicket[];
  prevAllTickets: StakeholderTicket[];
  showHealthBadge: boolean;
  velocityData: VelocityPoint[] | undefined;
  isVelocityLoading: boolean;
  lastUpdatedDisplay: string;
}

export function StakeholderSprintCards({
  isLoading,
  error,
  onRetry,
  rawTickets,
  stakeholderSprint,
  isCompareMode,
  prevStakeholderSprint,
  isPrevLoading,
  carriedKeys,
  isCarryOverLoading,
  previousSprint,
  doneTickets,
  inReviewTickets,
  inProgressTickets,
  todoTickets,
  deprecatedTickets,
  prevDoneTickets,
  prevInReviewTickets,
  prevInProgressTickets,
  prevTodoTickets,
  prevDeprecatedTickets,
  prevAllTickets,
  showHealthBadge,
  velocityData,
  isVelocityLoading,
  lastUpdatedDisplay,
}: StakeholderSprintCardsProps) {
  return (
    <div className="px-6 py-10 sm:px-8 lg:px-12 xl:px-16">
      {Boolean(error) && rawTickets && (
        <DataErrorState error={error} onRetry={onRetry} className="mx-auto mb-6 max-w-7xl" />
      )}
      {Boolean(error) && !rawTickets ? (
        // A failed fetch must not look like an empty sprint on the external view.
        <DataErrorState variant="full" error={error} onRetry={onRetry} className="py-16" />
      ) : isLoading || !rawTickets ? (
        <LoadingState label="Loading sprint data..." variant="spinner" />
      ) : !stakeholderSprint ? (
        // Not a loading condition: there is simply no sprint to show.
        <EmptyState title="No sprint selected" className="py-16" />
      ) : (
        <div className="mx-auto max-w-7xl space-y-10">
          {/* Sprint heading + health + goal + sparkline */}
          <div className="space-y-3">
            <p className="text-body-sm font-semibold uppercase tracking-label text-text-muted">
              Sprint overview
            </p>
            {!isCompareMode && (
              <>
                {/* Title row: name + health + sparkline */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <h2 className="font-[var(--font-display)] text-3xl font-semibold tracking-tight text-text-primary leading-none">
                    {stakeholderSprint.name}
                  </h2>
                  {showHealthBadge && (
                    <SprintHealthBanner
                      sprint={stakeholderSprint}
                      doneTickets={doneTickets}
                      inProgressTickets={[...inReviewTickets, ...inProgressTickets]}
                      todoTickets={todoTickets}
                      compact
                    />
                  )}
                  <VelocitySparkline
                    data={velocityData ?? []}
                    isLoading={isVelocityLoading}
                  />
                </div>

                {/* Sprint goal */}
                {stakeholderSprint.goal && (
                  <p className="max-w-2xl text-body-lg italic text-text-tertiary border-l-2 border-[var(--color-brand-400)]/25 pl-3">
                    {stakeholderSprint.goal}
                  </p>
                )}
              </>
            )}
            {isCompareMode && (
              <VelocitySparkline
                data={velocityData ?? []}
                isLoading={isVelocityLoading}
              />
            )}
          </div>

          {isCompareMode && prevStakeholderSprint ? (
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
              <div className="space-y-6 overflow-auto">
                <h2 className="font-[var(--font-display)] text-heading font-semibold tracking-tight text-text-secondary">
                  {prevStakeholderSprint.name}
                  <span className="ml-2 text-body-sm font-normal text-text-muted">Previous</span>
                </h2>
                {isPrevLoading ? (
                  <LoadingState label="Loading previous sprint..." variant="spinner" />
                ) : (
                  <SprintOverviewCard
                    sprint={prevStakeholderSprint}
                    doneTickets={prevDoneTickets}
                    inReviewTickets={prevInReviewTickets}
                    inProgressTickets={prevInProgressTickets}
                    todoTickets={prevTodoTickets}
                    deprecatedTickets={prevDeprecatedTickets}
                  />
                )}
              </div>
              <div className="space-y-6 overflow-auto">
                <h2 className="font-[var(--font-display)] text-heading font-semibold tracking-tight text-text-primary">
                  {stakeholderSprint.name}
                  <span className="ml-2 text-body-sm font-normal text-text-muted">Current</span>
                </h2>
                {isCarryOverLoading && (
                  <p className="flex items-center gap-1.5 text-body-sm text-text-muted">
                    <RefreshCw size={10} strokeWidth={1.5} className="animate-spin" />
                    Loading carry-over data...
                  </p>
                )}
                {!isCarryOverLoading && carriedKeys.size > 0 && (
                  <p className="text-body-sm text-amber-400/60">
                    {carriedKeys.size} ticket{carriedKeys.size === 1 ? "" : "s"} carried from {previousSprint?.name}
                  </p>
                )}
                <SprintOverviewCard
                  sprint={stakeholderSprint}
                  doneTickets={doneTickets}
                  inReviewTickets={inReviewTickets}
                  inProgressTickets={inProgressTickets}
                  todoTickets={todoTickets}
                  deprecatedTickets={deprecatedTickets}
                  carriedKeys={carriedKeys.size > 0 ? carriedKeys : undefined}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Carry-over summary */}
              {isCarryOverLoading && previousSprint && (
                <p className="flex items-center gap-1.5 text-body-sm text-text-muted">
                  <RefreshCw size={10} strokeWidth={1.5} className="animate-spin" />
                  Loading carry-over data...
                </p>
              )}
              {!isCarryOverLoading && carriedKeys.size > 0 && previousSprint && (
                <p className="text-body-sm text-[var(--color-warning-400)]/60">
                  {carriedKeys.size} ticket{carriedKeys.size === 1 ? "" : "s"} carried from {previousSprint.name}
                </p>
              )}
              <SprintOverviewCard
                sprint={stakeholderSprint}
                doneTickets={doneTickets}
                inReviewTickets={inReviewTickets}
                inProgressTickets={inProgressTickets}
                todoTickets={todoTickets}
                deprecatedTickets={deprecatedTickets}
                carriedKeys={carriedKeys.size > 0 ? carriedKeys : undefined}
                previousTickets={prevAllTickets.length > 0 ? prevAllTickets : undefined}
                showHealthBanner={false}
                showGoal={false}
              />
            </div>
          )}

          <p className="text-body-sm text-text-muted">Last updated: {lastUpdatedDisplay}</p>
        </div>
      )}
    </div>
  );
}
