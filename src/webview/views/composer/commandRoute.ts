import type { SlashCommand } from "../../../messages";
import type { Actions } from "../../store/dispatch";

/**
 * Route une commande slash « locale » (traitée dans la webview, `local: true`)
 * vers l'action correspondante. Les autres commandes repartent vers l'hôte via
 * `resolveCommand` (prompts `.md`, commandes MCP…).
 */
export function routeLocalCommand(actions: Actions, cmd: SlashCommand, args: string): void {
  switch (cmd.name) {
    case "components":
      actions.togglePanel("health");
      return;
    case "remember":
      actions.remember(args);
      return;
    case "compact":
      actions.compact();
      return;
    default:
      actions.resolveCommand(cmd.name, args);
  }
}
