import express from "express";
import { Router } from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

const JD_OPENAI = async (req, res) => {
  const { prompt } = req.body;
  console.log("BODY RECEIVED:", req.body);

  if (!prompt) {
    return res.status(400).json({
      success: false,
      error: "Prompt is required",
    });
  }

  // 🤖 Define your Primary and Fallback models from OpenRouter
  // Using a solid primary model and a reliable llama/nano fallback model
  const primaryModel = "nvidia/nemotron-3-super-120b-a12b:free"; 
  const fallbackModel = "meta-llama/llama-3-8b-instruct";

  // Helper function to build the API payload and send it
  const makeRequest = async (model) => {
    return await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that improves job descriptions. Enhance clarity, structure, and appeal while keeping all details.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.5,
        max_tokens: 600, // Kept higher for comprehensive job descriptions
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:5173", // 🔥 Localhost development fallback
          "X-Title": "Wevolve JD Builder",
        },
        timeout: 10000, // ⏱️ Prevent hanging (10 seconds timeout)
      }
    );
  };

  try {
    let response;

    try {
      // 🔥 Try primary model first
      console.log(`Attempting primary model: ${primaryModel}`);
      response = await makeRequest(primaryModel);
    } catch (err) {
      console.log("Primary model failed with status:", err.response?.status);

      // 🔁 Fallback only on explicit server/route issues or timeouts
      if (
        err.response?.status === 404 ||
        err.response?.status === 503 ||
        err.code === "ECONNABORTED"
      ) {
        console.log("Switching to fallback model...");
        response = await makeRequest(fallbackModel);
      } else {
        throw err; // Forward unexpected errors (like bad API keys) to the outer catch block
      }
    }

    // 🧠 Robust extraction of the generated text
    let outputText = "";

    if (response?.data?.choices?.length > 0) {
      const choice = response.data.choices[0];
      outputText =
        choice?.message?.content?.trim() ||
        choice?.text?.trim() ||
        choice?.delta?.content?.trim();
    }

    if (!outputText) {
      return res.status(502).json({
        success: false,
        error: "Empty response from AI providers",
      });
    }

    return res.status(200).json({
      success: true,
      data: outputText,
    });

  } catch (err) {
    console.error("===== AI API ERROR =====");
    console.error(err.response?.data || err.message);

    // Specific user-facing messages based on error type
    if (err.response?.status === 429) {
      return res.status(429).json({
        success: false,
        error: "Free AI limit reached. Please try again later.",
      });
    }

    if (err.code === "ECONNABORTED") {
      return res.status(500).json({
        success: false,
        error: "AI request timed out. Please try again.",
      });
    }

    return res.status(500).json({
      success: false,
      error: err.response?.data?.error?.message || "Failed to generate job description",
    });
  }
};

router.post("/generate-jd", JD_OPENAI);

export default router;