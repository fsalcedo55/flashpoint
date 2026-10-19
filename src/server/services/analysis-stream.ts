import { ReadableStream } from "node:stream/web";
import type { LanguageModel } from "ai";
import type { AnalysisInput, AnalysisStreamEvent } from "../../lib/analysis";
import { analyzeDocuments } from "./analyses";

// Adapt the extractor's progress callback to tRPC's typed async iterable.
export async function* streamAnalysis(input: AnalysisInput, options: { model?: LanguageModel; signal?: AbortSignal } = {}) {
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  const stream = new ReadableStream<AnalysisStreamEvent>({
    start(streamController) {
      void analyzeDocuments(input, {
        model: options.model,
        signal,
        onNote: (text) => streamController.enqueue({ type: "note", text }),
      }).then((result) => {
        streamController.enqueue({ type: "result", result });
        streamController.close();
      }).catch((error: unknown) => streamController.error(error));
    },
    cancel() { controller.abort(); },
  });

  try {
    yield* stream;
  } finally {
    controller.abort();
  }
}
