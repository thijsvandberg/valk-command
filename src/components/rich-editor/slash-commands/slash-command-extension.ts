import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export interface SlashPluginState {
  active: boolean;
  from: number;
  to: number;
  query: string;
}

export interface SlashCallbacks {
  arrowUp: (() => void) | null;
  arrowDown: (() => void) | null;
  enter: (() => boolean) | null;
  escape: (() => void) | null;
}

// Module-level registry keyed by the editor's root DOM element.
// This lets the React component register callbacks without mutating the editor prop.
const callbackRegistry = new WeakMap<Element, SlashCallbacks>();

export function registerSlashCallbacks(dom: Element, cbs: SlashCallbacks): void {
  callbackRegistry.set(dom, cbs);
}

export function unregisterSlashCallbacks(dom: Element): void {
  callbackRegistry.delete(dom);
}

export const slashPluginKey = new PluginKey<SlashPluginState>("slashCommands");

// Matches a slash command trigger: "/" at start of block or after whitespace,
// followed by only letters/hyphens up to the cursor.
const SLASH_TRIGGER_REGEX = /(?:^|\s)(\/([a-zA-Z\-]*)$)/;

export const SlashCommandExtension = Extension.create({
  name: "slashCommands",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: slashPluginKey,

        state: {
          init(): SlashPluginState {
            return { active: false, from: 0, to: 0, query: "" };
          },

          apply(_tr, _prev, _oldState, newState): SlashPluginState {
            const { selection } = newState;

            // Only activate for collapsed text selections inside text blocks
            if (!selection.empty) {
              return { active: false, from: 0, to: 0, query: "" };
            }

            const { $from } = selection;
            if (!$from.parent.isTextblock) {
              return { active: false, from: 0, to: 0, query: "" };
            }

            // Text from start of block to cursor. '\0' replaces non-text leaf nodes
            // to prevent the regex from accidentally matching across node boundaries.
            const textBefore = $from.parent.textBetween(
              0,
              $from.parentOffset,
              undefined,
              "\0"
            );
            const match = SLASH_TRIGGER_REGEX.exec(textBefore);
            if (!match) {
              return { active: false, from: 0, to: 0, query: "" };
            }

            // match[1] = "/query", match[2] = "query"
            const slashRelPos = textBefore.length - match[1].length;
            const from = $from.start() + slashRelPos;
            return { active: true, from, to: $from.pos, query: match[2] };
          },
        },

        props: {
          handleKeyDown(view, event) {
            const state = slashPluginKey.getState(view.state);
            if (!state?.active) return false;

            const cbs = callbackRegistry.get(view.dom);
            if (!cbs) return false;

            if (event.key === "ArrowDown") {
              event.preventDefault();
              cbs.arrowDown?.();
              return true;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              cbs.arrowUp?.();
              return true;
            }
            if (event.key === "Enter") {
              const handled = cbs.enter?.();
              if (handled) {
                event.preventDefault();
                return true;
              }
              return false;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cbs.escape?.();
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});
