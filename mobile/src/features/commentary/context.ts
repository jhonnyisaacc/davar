import { create } from "zustand";
import type { CommentaryContext } from "@davar/shared/productContracts";
export const useCommentaryContext = create<{
	context: CommentaryContext | null;
	setContext: (context: CommentaryContext | null) => void;
}>((set) => ({ context: null, setContext: (context) => set({ context }) }));
