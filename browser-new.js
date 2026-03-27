// REPLACEMENT bulkCreate function - Semi-automated mode
// User clicks Save, extension detects navigation and loads next question

// Bulk create questions - SEMI-AUTOMATED (user clicks Save, we detect it)
async function bulkCreate() {
  if (state.selectedQuestions.size === 0 || bulkCreateInProgress) return;

  bulkCreateInProgress = true;
  const selectedQuestions = state.questions.filter(q => state.selectedQuestions.has(q.id));
  let currentIndex = 0;

  console.log("[Bulk Create] Starting - SEMI-AUTOMATED MODE");

  // UI elements
  const bulkProgress = document.getElementById("bulkProgress");
  const bulkSection = document.getElementById("bulkSection");
  const progressText = document.getElementById("progressText");
  const progressCount = document.getElementById("progressCount");
  const progressFill = document.getElementById("progressFill");

  bulkSection.style.display = "none";
  bulkProgress.style.display = "block";

  // Find target tab
  const tabs = await chrome.tabs.query({});
  const targetTab = tabs.find(t =>
    t.url && (t.url.includes("admin.pepu.krd") || t.url.includes("www.admin.pepu.krd"))
  );

  if (!targetTab) {
    showToast("❌ admin.pepu.kرد تاب نەدۆزرایەوە", "error");
    bulkProgress.style.display = "none";
    bulkCreateInProgress = false;
    return;
  }

  // Navigate to edit page first
  await chrome.tabs.update(targetTab.id, {
    url: `https://admin.pepu.krd/Courses/Questions/Edit?courseId=16`
  });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Listen for tab updates (when user clicks Save)
  const onTabUpdated = (updatedTabId, changeInfo, tab) => {
    if (updatedTabId === targetTab.id && changeInfo.status === "complete" && tab.url) {
      console.log("[Bulk Create] Tab updated:", tab.url);

      // If we're back to View page, user clicked Save
      if (tab.url.includes("/Courses/View/")) {
        console.log("[Bulk Create] User clicked Save! Loading next question...");
        setTimeout(() => loadNextQuestion(), 500);
      }
    }
  };

  chrome.tabs.onUpdated.addListener(onTabUpdated);

  async function loadNextQuestion() {
    if (currentIndex >= selectedQuestions.length) {
      finishBulkCreate();
      return;
    }

    const q = selectedQuestions[currentIndex];
    const card = document.querySelector(`.q-checkbox[data-id="${q.id}"]`)?.closest(".q-card");

    // Update progress
    progressText.textContent = `پرسیار ${currentIndex + 1}/${selectedQuestions.length} - کلیکی "Save" بکە!`;
    progressCount.textContent = `${currentIndex + 1}/${selectedQuestions.length}`;
    progressFill.style.width = `${((currentIndex) / selectedQuestions.length) * 100}%`;

    card?.classList.add("bulk-processing");

    console.log(`[Bulk Create] Loading question ${currentIndex + 1}:`, q.id);

    try {
      // Navigate to edit page
      await chrome.tabs.update(targetTab.id, {
        url: `https://admin.pepu.krd/Courses/Questions/Edit?courseId=16`
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Fill the form
      const fillResult = await chrome.runtime.sendMessage({
        type: "FILL_SPECIFIC_TAB",
        tabId: targetTab.id,
        payload: {
          questionId: q.id,
          questionText: q.questionText,
          options: q.options || [],
          correctAnswer: q.correctAnswer || "",
        }
      });

      if (fillResult?.ok) {
        showToast(`✅ پرسیار ${currentIndex + 1} پڕکرایەوە - کلیکی "Save" بکە!`, "success");

        // Mark as completed in UI (but still waiting for save)
        card?.classList.remove("bulk-processing");
        card?.classList.add("bulk-done");

        // Update progress bar
        progressFill.style.width = `${((currentIndex + 1) / selectedQuestions.length) * 100}%`;

        // Wait for user to click Save (detected by onTabUpdated)
        currentIndex++;

      } else {
        showToast(`❌ پڕنەبووەوە: ${fillResult?.error}`, "error");
        card?.classList.remove("bulk-processing");
        currentIndex++;
        setTimeout(loadNextQuestion, 1000);
      }

    } catch (e) {
      console.error("[Bulk Create] Error:", e);
      card?.classList.remove("bulk-processing");
      showToast(`❌ هەڵە: ${e}`, "error");
      currentIndex++;
      if (currentIndex < selectedQuestions.length) {
        setTimeout(loadNextQuestion, 1000);
      } else {
        finishBulkCreate();
      }
    }
  }

  function finishBulkCreate() {
    chrome.tabs.onUpdated.removeListener(onTabUpdated);
    bulkProgress.style.display = "none";
    updateBulkUI();
    bulkCreateInProgress = false;

    // Uncheck all questions
    state.selectedQuestions.clear();
    document.querySelectorAll(".q-checkbox").forEach(cb => {
      cb.checked = false;
      cb.closest(".q-card")?.classList.remove("selected");
    });

    showToast(`✅ تەواو بوو! ${currentIndex} پرسیار`, "success");
    console.log("[Bulk Create] Finished. Total:", currentIndex);
  }

  // Start with first question
  loadNextQuestion();
}
