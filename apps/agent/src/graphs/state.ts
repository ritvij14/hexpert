// LangGraph state annotation mirroring @hexpert/shared GraphState (PRD §2/§4.9).
// Subgraphs (wallet/audit — Step 6+) extend this with their own fields.

import { Annotation } from "@langchain/langgraph";
import type { Message, Intent, WalletProfile, AuditReport } from "@hexpert/shared";

export const GraphStateAnnotation = Annotation.Root({
  sessionId: Annotation<string>(),
  intent: Annotation<Intent>(),
  messages: Annotation<Message[]>({
    reducer: (a, b) => [...(a ?? []), ...(b ?? [])],
    default: () => [],
  }),
  walletAddress: Annotation<string>(),
  fileContent: Annotation<string>(),
  fileName: Annotation<string>(),
  walletProfile: Annotation<WalletProfile>(),
  auditReport: Annotation<AuditReport>(),
  awaitingHITL: Annotation<boolean>({
    reducer: (_a, b) => b,
    default: () => false,
  }),
  hitlPrompt: Annotation<string>(),
});