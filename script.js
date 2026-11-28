const form = document.querySelector(".link-form");
const linkInput = document.querySelector("#video-link");
const message = document.querySelector("#video-message");
const videoFrame = document.querySelector("#video-frame");
const transcriptSection = document.querySelector("#transcript-section");
const transcriptForm = document.querySelector("#transcript-form");
const transcriptInput = document.querySelector("#transcript-input");
const transcriptMessage = document.querySelector("#transcript-message");
const analyzeButton = document.querySelector("#analyze-button");
const analyzeSpinner = document.querySelector("#analyze-spinner");
const submittedTranscript = document.querySelector("#submitted-transcript");
let currentVideoId = null;
let transcriptRequestController = null;

function getYouTubeVideoId(value) {
  let url;

  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  let videoId = null;

  if (
    (url.hostname === "youtube.com" || url.hostname === "www.youtube.com") &&
    segments[0] === "watch"
  ) {
    videoId = url.searchParams.get("v");
  } else if (
    (url.hostname === "youtube.com" || url.hostname === "www.youtube.com") &&
    segments[0] === "shorts"
  ) {
    videoId = segments[1];
  } else if (url.hostname === "youtu.be") {
    videoId = segments[0];
  }

  return videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
}

function showTranscriptMessage(text, { loading = false, error = false } = {}) {
  transcriptMessage.textContent = text;
  transcriptMessage.hidden = false;
  transcriptMessage.dataset.loading = String(loading);
  transcriptMessage.dataset.error = String(error);
}

function clearTranscriptMessage() {
  transcriptMessage.hidden = true;
  delete transcriptMessage.dataset.loading;
  delete transcriptMessage.dataset.error;
}

async function loadTranscript(videoId) {
  transcriptRequestController?.abort();
  const controller = new AbortController();
  transcriptRequestController = controller;
  showTranscriptMessage("Retrieving YouTube captions...", { loading: true });

  try {
    const response = await fetch("/api/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId }),
      signal: controller.signal,
    });

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("The transcript service returned an unreadable response.");
    }

    if (controller.signal.aborted || currentVideoId !== videoId) {
      return;
    }

    if (!response.ok) {
      throw new Error(
        typeof result.detail === "string"
          ? result.detail
          : "The transcript service could not retrieve captions.",
      );
    }

    if (!transcriptInput.value.trim()) {
      transcriptInput.value = result.transcript;
    }

    const language = `${result.language} (${result.language_code})`;
    const captionType = result.is_generated
      ? "auto-generated captions"
      : "captions";
    showTranscriptMessage(`Loaded ${captionType} in ${language}.`);
  } catch (error) {
    if (controller.signal.aborted || currentVideoId !== videoId) {
      return;
    }

    const errorMessage =
      error instanceof TypeError
        ? "Could not connect to the transcript service. Make sure the backend is running and try again."
        : error instanceof Error
          ? error.message
          : "Could not retrieve captions. Please try again.";
    showTranscriptMessage(errorMessage, { error: true });
  } finally {
    if (transcriptRequestController === controller) {
      transcriptRequestController = null;
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  transcriptRequestController?.abort();
  transcriptRequestController = null;
  currentVideoId = null;
  transcriptSection.hidden = true;
  clearTranscriptMessage();
  submittedTranscript.hidden = true;
  submittedTranscript.textContent = "";
  analyzeButton.disabled = false;
  analyzeSpinner.hidden = true;
  videoFrame.onload = null;
  videoFrame.hidden = true;
  videoFrame.removeAttribute("src");
  message.hidden = false;
  message.dataset.loading = "false";

  const videoId = getYouTubeVideoId(linkInput.value);
  if (!videoId) {
    message.textContent =
      "Please enter a valid YouTube video, Shorts, or youtu.be link.";
    return;
  }

  currentVideoId = videoId;
  message.textContent = "Loading video...";
  message.dataset.loading = "true";
  videoFrame.onload = () => {
    message.hidden = true;
    delete message.dataset.loading;
    transcriptSection.hidden = false;
    loadTranscript(videoId);
    videoFrame.onload = null;
  };
  videoFrame.hidden = false;
  videoFrame.src = `https://www.youtube.com/embed/${videoId}`;
});

transcriptForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const transcript = transcriptInput.value.trim();

  if (!transcript) {
    analyzeButton.disabled = false;
    analyzeSpinner.hidden = true;
    showTranscriptMessage(
      "Please paste a transcript before submitting it.",
      { error: true },
    );
    return;
  }

  if (event.submitter?.id === "analyze-button") {
    showTranscriptMessage(
      "Highlight analysis is not implemented yet. No analysis was performed.",
    );
    return;
  }

  submittedTranscript.textContent = transcript;
  submittedTranscript.hidden = false;
  analyzeButton.disabled = false;
  analyzeSpinner.hidden = true;
  showTranscriptMessage("Transcript submitted. Timestamps are preserved as entered.");
});
