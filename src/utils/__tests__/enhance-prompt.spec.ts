// npx vitest run src/utils/__tests__/enhance-prompt.spec.ts

import type { ProviderSettings } from "@roo-code/types"

import { singleCompletionHandler } from "../single-completion-handler"
import { buildApiHandler, SingleCompletionHandler } from "../../api"
import { supportPrompt } from "../../shared/support-prompt"

// Mock the API handler
vi.mock("../../api", () => ({
	buildApiHandler: vi.fn(),
}))

describe("enhancePrompt", () => {
	const mockApiConfig: ProviderSettings = {
		apiProvider: "openai",
		openAiApiKey: "test-key",
		openAiBaseUrl: "https://api.openai.com/v1",
		enableReasoningEffort: false,
	}

	beforeEach(() => {
		vi.clearAllMocks()

		// Mock the API handler with a completePrompt method
		;(buildApiHandler as any).mockReturnValue({
			completePrompt: vi.fn().mockResolvedValue("Enhanced prompt"),
			createMessage: vi.fn(),
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: {
					maxTokens: 4096,
					contextWindow: 8192,
					supportsPromptCache: false,
				},
			}),
		} as unknown as SingleCompletionHandler)
	})

	it("enhances prompt using default enhancement prompt when no custom prompt provided", async () => {
		const result = await singleCompletionHandler(mockApiConfig, "Test prompt")

		expect(result).toBe("Enhanced prompt")
		const handler = buildApiHandler(mockApiConfig)
		expect((handler as any).completePrompt).toHaveBeenCalledWith(`Test prompt`)
	})

	it("enhances prompt using custom enhancement prompt when provided", async () => {
		const customEnhancePrompt = "You are a custom prompt enhancer"
		const customEnhancePromptWithTemplate = customEnhancePrompt + "\n\n${userInput}"

		const result = await singleCompletionHandler(
			mockApiConfig,
			supportPrompt.create(
				"ENHANCE",
				{
					userInput: "Test prompt",
				},
				{
					ENHANCE: customEnhancePromptWithTemplate,
				},
			),
		)

		expect(result).toBe("Enhanced prompt")
		const handler = buildApiHandler(mockApiConfig)
		expect((handler as any).completePrompt).toHaveBeenCalledWith(`${customEnhancePrompt}\n\nTest prompt`)
	})

	it("throws error for empty prompt input", async () => {
		await expect(singleCompletionHandler(mockApiConfig, "")).rejects.toThrow("No prompt text provided")
	})

	it("throws error for missing API configuration", async () => {
		await expect(singleCompletionHandler({} as ProviderSettings, "Test prompt")).rejects.toThrow(
			"No valid API configuration provided",
		)
	})

	// kilocode_change start - updated tests to work with createMessage fallback
	it("falls back to createMessage for API provider without completePrompt", async () => {
		const mockStream = {
			async *[Symbol.asyncIterator]() {
				yield { type: "text", text: "Fallback " }
				yield { type: "text", text: "response" }
				yield { type: "usage", totalCost: 0.01 }
			},
		}

		;(buildApiHandler as any).mockReturnValue({
			createMessage: vi.fn().mockReturnValue(mockStream),
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: {
					maxTokens: 4096,
					contextWindow: 8192,
					supportsPromptCache: false,
				},
			}),
		})

		const result = await singleCompletionHandler(mockApiConfig, "Test prompt")

		expect(result).toBe("Fallback response")
		const handler = buildApiHandler(mockApiConfig)
		expect((handler as any).createMessage).toHaveBeenCalledWith("", [
			{ role: "user", content: [{ type: "text", text: "Test prompt" }] },
		])
	})

	it("handles streaming errors gracefully in fallback mode", async () => {
		const mockStream = {
			async *[Symbol.asyncIterator]() {
				yield { type: "text", text: "Partial " }
				throw new Error("Stream error")
			},
		}

		;(buildApiHandler as any).mockReturnValue({
			// No completePrompt method
			createMessage: vi.fn().mockReturnValue(mockStream), // kilocode_change
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: {
					maxTokens: 4096,
					contextWindow: 8192,
					supportsPromptCache: false,
				},
			}),
		})

		await expect(singleCompletionHandler(mockApiConfig, "Test prompt")).rejects.toThrow("Stream error")

		const handler = buildApiHandler(mockApiConfig)
		expect((handler as any).createMessage).toHaveBeenCalledWith("", [
			{ role: "user", content: [{ type: "text", text: "Test prompt" }] },
		])
	})
	// kilocode_change end - updated tests to work with createMessage fallback

	it("uses appropriate model based on provider", async () => {
		const openRouterConfig: ProviderSettings = {
			apiProvider: "openrouter",
			openRouterApiKey: "test-key",
			openRouterModelId: "test-model",
			enableReasoningEffort: false,
		}

		// Mock successful enhancement
		;(buildApiHandler as any).mockReturnValue({
			completePrompt: vi.fn().mockResolvedValue("Enhanced prompt"),
			createMessage: vi.fn(),
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: {
					maxTokens: 4096,
					contextWindow: 8192,
					supportsPromptCache: false,
				},
			}),
		} as unknown as SingleCompletionHandler)

		const result = await singleCompletionHandler(openRouterConfig, "Test prompt")

		expect(buildApiHandler).toHaveBeenCalledWith(openRouterConfig)
		expect(result).toBe("Enhanced prompt")
	})

	it("propagates API errors", async () => {
		;(buildApiHandler as any).mockReturnValue({
			completePrompt: vi.fn().mockRejectedValue(new Error("API Error")),
			createMessage: vi.fn(),
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: {
					maxTokens: 4096,
					contextWindow: 8192,
					supportsPromptCache: false,
				},
			}),
		} as unknown as SingleCompletionHandler)

		await expect(singleCompletionHandler(mockApiConfig, "Test prompt")).rejects.toThrow("API Error")
	})
})
