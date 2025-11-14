const axios = require("axios");
const logger = require("../utils/logger.js");

/**
 * Multi-Modal AI Service
 * Image analysis, OCR, and visual content understanding
 */
class VisionService {
  constructor() {
    this.lunabyBaseURL = process.env.LUNABY_BASE_URL || "https://api.lunie.dev/v1";
    this.lunabyApiKey = process.env.LUNABY_API_KEY;
    this.visionModel = "lunaby-vision";
  }

  /**
   * Analyze an image from URL
   */
  async analyzeImage(imageUrl, prompt = "Describe this image in detail") {
    try {
      logger.info("VISION_SERVICE", `Analyzing image: ${imageUrl}`);
      
      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: prompt,
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ];
      
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: this.visionModel,
          messages: messages,
          max_tokens: 1024,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        }
      );
      
      const analysis = response.data.choices[0].message.content;
      logger.info("VISION_SERVICE", "Image analysis completed");
      
      return {
        success: true,
        analysis,
        model: this.visionModel,
      };
    } catch (error) {
      logger.error("VISION_SERVICE", `Error analyzing image: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Extract text from image (OCR)
   */
  async extractText(imageUrl) {
    try {
      logger.info("VISION_SERVICE", `Extracting text from: ${imageUrl}`);
      
      const prompt = "Extract all visible text from this image. Provide only the text content, maintaining the original structure and formatting as much as possible.";
      
      const result = await this.analyzeImage(imageUrl, prompt);
      
      if (result.success) {
        return {
          success: true,
          text: result.analysis,
        };
      }
      
      return result;
    } catch (error) {
      logger.error("VISION_SERVICE", `Error extracting text: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Identify objects in image
   */
  async identifyObjects(imageUrl) {
    try {
      logger.info("VISION_SERVICE", `Identifying objects in: ${imageUrl}`);
      
      const prompt = "List all objects, people, and notable elements visible in this image. Provide a structured list with confidence levels if possible.";
      
      const result = await this.analyzeImage(imageUrl, prompt);
      
      return result;
    } catch (error) {
      logger.error("VISION_SERVICE", `Error identifying objects: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get image sentiment/mood analysis
   */
  async analyzeSentiment(imageUrl) {
    try {
      logger.info("VISION_SERVICE", `Analyzing sentiment of: ${imageUrl}`);
      
      const prompt = "Analyze the emotional tone and sentiment of this image. Describe the mood, atmosphere, and any emotions conveyed.";
      
      const result = await this.analyzeImage(imageUrl, prompt);
      
      return result;
    } catch (error) {
      logger.error("VISION_SERVICE", `Error analyzing sentiment: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Compare two images
   */
  async compareImages(imageUrl1, imageUrl2) {
    try {
      logger.info("VISION_SERVICE", "Comparing two images");
      
      const messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Compare these two images and describe the similarities and differences.",
            },
            {
              type: "image_url",
              image_url: { url: imageUrl1 },
            },
            {
              type: "image_url",
              image_url: { url: imageUrl2 },
            },
          ],
        },
      ];
      
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: this.visionModel,
          messages: messages,
          max_tokens: 1024,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        }
      );
      
      const comparison = response.data.choices[0].message.content;
      
      return {
        success: true,
        comparison,
      };
    } catch (error) {
      logger.error("VISION_SERVICE", `Error comparing images: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Answer questions about an image
   */
  async askAboutImage(imageUrl, question) {
    try {
      logger.info("VISION_SERVICE", `Answering question about image: ${question}`);
      
      const result = await this.analyzeImage(imageUrl, question);
      
      return result;
    } catch (error) {
      logger.error("VISION_SERVICE", `Error answering question: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Detect if image contains inappropriate content
   */
  async moderateImage(imageUrl) {
    try {
      logger.info("VISION_SERVICE", `Moderating image: ${imageUrl}`);
      
      const prompt = "Analyze this image for potentially inappropriate, harmful, or NSFW content. Provide a safety rating (safe/questionable/unsafe) and explain your reasoning.";
      
      const result = await this.analyzeImage(imageUrl, prompt);
      
      if (result.success) {
        // Simple parsing to determine safety
        const analysis = result.analysis.toLowerCase();
        let safetyRating = "safe";
        
        if (analysis.includes("unsafe") || analysis.includes("nsfw") || analysis.includes("inappropriate")) {
          safetyRating = "unsafe";
        } else if (analysis.includes("questionable") || analysis.includes("caution")) {
          safetyRating = "questionable";
        }
        
        return {
          success: true,
          safetyRating,
          analysis: result.analysis,
        };
      }
      
      return result;
    } catch (error) {
      logger.error("VISION_SERVICE", `Error moderating image: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate image caption
   */
  async generateCaption(imageUrl, style = "descriptive") {
    try {
      logger.info("VISION_SERVICE", `Generating ${style} caption for image`);
      
      let prompt;
      switch (style) {
        case "short":
          prompt = "Create a short, concise caption for this image (1-2 sentences).";
          break;
        case "creative":
          prompt = "Create a creative, engaging caption for this image suitable for social media.";
          break;
        case "technical":
          prompt = "Provide a technical description of this image, including composition, lighting, and visual elements.";
          break;
        default:
          prompt = "Generate a descriptive caption for this image.";
      }
      
      const result = await this.analyzeImage(imageUrl, prompt);
      
      return result;
    } catch (error) {
      logger.error("VISION_SERVICE", `Error generating caption: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Process multiple images at once
   */
  async analyzeMultipleImages(imageUrls, prompt) {
    try {
      logger.info("VISION_SERVICE", `Analyzing ${imageUrls.length} images`);
      
      const content = [
        {
          type: "text",
          text: prompt || "Analyze these images and describe what you see.",
        },
      ];
      
      // Add all images
      imageUrls.forEach(url => {
        content.push({
          type: "image_url",
          image_url: { url },
        });
      });
      
      const messages = [{ role: "user", content }];
      
      const response = await axios.post(
        `${this.lunabyBaseURL}/chat/completions`,
        {
          model: this.visionModel,
          messages: messages,
          max_tokens: 2048,
        },
        {
          headers: {
            "Authorization": `Bearer ${this.lunabyApiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 90000,
        }
      );
      
      const analysis = response.data.choices[0].message.content;
      
      return {
        success: true,
        analysis,
        imageCount: imageUrls.length,
      };
    } catch (error) {
      logger.error("VISION_SERVICE", `Error analyzing multiple images: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = new VisionService();
