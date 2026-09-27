// Render backend URL, without the endpoint path.
const BACKEND_URL = "https://study-planner-backend-f7vj.onrender.com";

const form = document.getElementById("study-plan-form");
const subjectInput = document.getElementById("subject");
const minutesInput = document.getElementById("minutes");
const difficultyInput = document.getElementById("difficulty");
const energyInput = document.getElementById("energy");
const generateButton = document.getElementById("generate-plan-button");
const statusMessage = document.getElementById("status-message");
const studyPlan = document.getElementById("study-plan");
let isLoading = false;

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

// Handle validation here so errors also appear in the status area.
form.noValidate = true;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isLoading) return;

  const subject = subjectInput.value.trim();
  const minutes = Number(minutesInput.value);
  const difficulty = difficultyInput.value;
  const energy = energyInput.value;

  if (!subject) {
    showStatus("Please enter a subject.", true);
    subjectInput.focus();
    return;
  }

  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    showStatus("Please enter a positive whole number of study minutes.", true);
    minutesInput.focus();
    return;
  }

  if (!["easy", "medium", "hard"].includes(difficulty)) {
    showStatus("Please select a difficulty level.", true);
    difficultyInput.focus();
    return;
  }

  if (!["low", "medium", "high"].includes(energy)) {
    showStatus("Please select an energy level.", true);
    energyInput.focus();
    return;
  }

  isLoading = true;
  generateButton.disabled = true;
  generateButton.textContent = "Generating…";
  studyPlan.textContent = "";
  studyPlan.setAttribute("aria-busy", "true");
  showStatus("Generating your plan… This may take a moment.");

  // Allow time for the backend to start, but do not wait indefinitely.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch(`${BACKEND_URL.replace(/\/+$/, "")}/generate-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, minutes, difficulty, energy }),
      signal: controller.signal,
    });

    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new Error(
        response.ok
          ? "The backend returned an invalid JSON response. Please try again."
          : `The backend could not generate a plan (HTTP ${response.status}). Please try again.`
      );
    }

    if (!response.ok || data?.error) {
      const backendMessage = data?.error || data?.message;
      throw new Error(
        typeof backendMessage === "string" && backendMessage.trim()
          ? backendMessage
          : `The backend could not generate a plan (HTTP ${response.status}). Please try again.`
      );
    }

    // The backend returns a summary and an array of scheduled activities.
    if (!Array.isArray(data?.activities) || data.activities.length === 0) {
      throw new Error("The backend returned no study activities. Please try again.");
    }

    const validActivities = data.activities.every((activity) =>
      activity &&
      typeof activity.title === "string" && activity.title.trim() &&
      typeof activity.instructions === "string" &&
      Number.isFinite(activity.start_minute) && activity.start_minute >= 0 &&
      Number.isFinite(activity.end_minute) && activity.end_minute >= activity.start_minute &&
      Number.isFinite(activity.duration_minutes) && activity.duration_minutes > 0
    );

    if (!validActivities) {
      throw new Error("The backend returned an incomplete activity. Please try again.");
    }

    // Build the result with textContent so backend text is never treated as HTML.
    const overview = document.createElement("p");
    overview.textContent = `${data.subject ?? subject} - ${data.minutes ?? minutes} minutes`;
    studyPlan.appendChild(overview);

    if (typeof data.summary === "string" && data.summary.trim()) {
      const summary = document.createElement("p");
      summary.textContent = data.summary;
      studyPlan.appendChild(summary);
    }

    const activityList = document.createElement("ol");
    for (const activity of data.activities) {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = activity.title;

      const timing = document.createElement("p");
      timing.textContent = `${activity.start_minute}-${activity.end_minute} min (${activity.duration_minutes} minutes)`;

      const instructions = document.createElement("p");
      instructions.textContent = activity.instructions;

      item.append(title, timing, instructions);
      activityList.appendChild(item);
    }

    studyPlan.appendChild(activityList);
    showStatus("Your study plan is ready.");
  } catch (error) {
    if (error.name === "AbortError") {
      showStatus("The request took too long. Please try again shortly.", true);
    } else if (error instanceof TypeError) {
      showStatus("Could not reach the backend. Check your connection, backend URL, and the backend's CORS settings.", true);
    } else {
      showStatus(error.message || "Something went wrong. Please try again.", true);
    }
  } finally {
    clearTimeout(timeoutId);
    isLoading = false;
    generateButton.disabled = false;
    generateButton.textContent = "Generate Study Plan";
    studyPlan.setAttribute("aria-busy", "false");
  }
});
