// Static-site research cat: cute interactions first, optional LLM endpoint second.
(function () {
  const CAT_CHAT_ENDPOINT = window.CAT_CHAT_ENDPOINT || "https://vanshramani-github-io.vercel.app/api/cat-chat";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const facts = [
    {
      keys: ["who", "about", "vansh", "bio"],
      answer: "Vansh Ramani is a CSE undergrad at IIT Delhi working across AI, graph learning, nearest-neighbor search, data distillation, and agentic systems."
    },
    {
      keys: ["ramain", "yc", "y combinator", "startup"],
      answer: "Vansh is building ramAIn, a YC W26 startup focused on super fast computer-use agents."
    },
    {
      keys: ["research", "interests", "work"],
      answer: "His research spans graph neural networks, graph distillation, high-dimensional nearest-neighbor search, causal representation learning, neurosymbolic AI, and machine unlearning."
    },
    {
      keys: ["publications", "papers", "paper"],
      answer: "Highlighted papers include Panorama: Fast-Track Nearest Neighbors, Bonsai at ICLR 2025, and MolMerger in ACS JCTC 2024."
    },
    {
      keys: ["cmu", "carnegie"],
      answer: "At CMU, Vansh worked with Prof. Pradeep Ravikumar on causal representation learning, neurosymbolic AI, and machine unlearning."
    },
    {
      keys: ["copenhagen", "diku", "panagiotis", "nearest"],
      answer: "At University of Copenhagen / DIKU, he worked with Dr. Panagiotis Karras on high-dimensional nearest-neighbor search and Panorama."
    },
    {
      keys: ["contact", "email"],
      answer: "You can reach Vansh at vanshramani27@gmail.com or cs5230804@iitd.ac.in."
    },
    {
      keys: ["music", "jazz", "fun"],
      answer: "The personal lore: Vansh likes jazz, random facts, research rabbit holes, and apparently now one very opinionated website cat."
    }
  ];

  const idlePhrases = [
    "mrrp. ask me about Vansh.",
    "I guard the publications section.",
    "tap me. scientifically proven to improve vibes.",
    "pspsps: ship ramAIn.",
    "zoomies are O(n), naps are O(1).",
    "I found a broken link and sat on it.",
    "throw the yarn. I dare you."
  ];

  const purrs = [
    "purr purr purr",
    "mew!",
    "excellent petting technique.",
    "10/10 chin scratch.",
    "I will cite this in my acknowledgements.",
    "mrrrrp."
  ];

  let phraseIndex = 0;
  let petCount = 0;
  let x = Math.max(96, Math.min(window.innerWidth - 150, window.innerWidth * 0.72));
  let y = Math.max(150, Math.min(window.innerHeight - 150, window.innerHeight * 0.36));
  let direction = 1;
  let speechTimer;
  let idleTimer;
  let zoomTimer;
  let toyTimer;
  let tapTimer;
  let movementTimer;
  let sitTimer;
  let longPressTimer;
  let toyMode = false;
  let longPressOpened = false;
  let audioContext;
  let lastPointer = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createCat() {
    const root = document.createElement("div");
    root.className = "site-cat";
    root.style.left = x + "px";
    root.style.top = y + "px";
    root.innerHTML = [
      '<div class="site-cat__bubble" role="status" aria-live="polite"></div>',
      '<form class="site-cat-chat" hidden>',
      '  <div class="site-cat-chat__log" aria-live="polite"></div>',
      '  <label class="site-cat-chat__label" for="site-cat-question">Ask the cat about Vansh</label>',
      '  <div class="site-cat-chat__row">',
      '    <input id="site-cat-question" class="site-cat-chat__input" name="question" autocomplete="off" placeholder="What does Vansh research?">',
      '    <button class="site-cat-chat__send" type="submit">ask</button>',
      '  </div>',
      '</form>',
      '<button class="site-cat__pet-zone" type="button" aria-label="Pet the research cat">',
      '  <span class="site-cat__shadow" aria-hidden="true"></span>',
      '  <span class="site-cat__body-wrap" aria-hidden="true">',
      '    <svg class="site-cat__sprite" viewBox="0 0 22 24" role="img" aria-label="pixel orange cat">',
      '      <g class="site-cat__tail-pixels">',
      '        <rect x="15" y="20" width="3" height="2"></rect>',
      '        <rect x="18" y="17" width="2" height="3"></rect>',
      '        <rect x="18" y="14" width="2" height="3"></rect>',
      '        <rect x="17" y="13" width="2" height="1"></rect>',
      '        <rect x="16" y="12" width="1" height="2" class="fur-light"></rect>',
      '      </g>',
      '      <g class="site-cat__body-pixels">',
      '        <rect x="5" y="12" width="11" height="1"></rect>',
      '        <rect x="4" y="13" width="13" height="1"></rect>',
      '        <rect x="4" y="14" width="13" height="7"></rect>',
      '        <rect x="5" y="21" width="11" height="1"></rect>',
      '        <rect x="6" y="22" width="9" height="1"></rect>',
      '        <rect x="16" y="14" width="1" height="7" class="shade"></rect>',
      '        <rect x="8" y="14" width="5" height="1" class="cream"></rect>',
      '        <rect x="7" y="15" width="7" height="6" class="cream"></rect>',
      '        <rect x="8" y="21" width="5" height="1" class="cream"></rect>',
      '      </g>',
      '      <g class="site-cat__paw-pixels">',
      '        <rect x="6" y="20" width="3" height="3" class="cream"></rect>',
      '        <rect x="11" y="20" width="3" height="3" class="cream"></rect>',
      '        <rect x="9" y="20" width="2" height="3"></rect>',
      '      </g>',
      '      <g class="site-cat__head-pixels">',
      '        <rect x="3" y="3" width="4" height="1" class="ear"></rect>',
      '        <rect x="4" y="2" width="3" height="1" class="ear"></rect>',
      '        <rect x="4" y="1" width="2" height="1" class="ear"></rect>',
      '        <rect x="5" y="0" width="1" height="1" class="ear"></rect>',
      '        <rect x="5" y="2" width="1" height="1" class="pink"></rect>',
      '        <rect x="14" y="3" width="4" height="1" class="ear"></rect>',
      '        <rect x="14" y="2" width="3" height="1" class="ear"></rect>',
      '        <rect x="15" y="1" width="2" height="1" class="ear"></rect>',
      '        <rect x="15" y="0" width="1" height="1" class="ear"></rect>',
      '        <rect x="15" y="2" width="1" height="1" class="pink"></rect>',
      '        <rect x="5" y="3" width="11" height="1"></rect>',
      '        <rect x="4" y="4" width="13" height="1"></rect>',
      '        <rect x="3" y="5" width="15" height="6"></rect>',
      '        <rect x="4" y="11" width="13" height="1"></rect>',
      '        <rect x="5" y="12" width="11" height="1"></rect>',
      '        <rect x="16" y="5" width="1" height="6" class="shade"></rect>',
      '        <rect x="9" y="4" width="3" height="3" class="cream"></rect>',
      '        <rect x="8" y="9" width="6" height="3" class="cream"></rect>',
      '        <rect x="6" y="6" width="2" height="3" class="eye eye-left"></rect>',
      '        <rect x="13" y="6" width="2" height="3" class="eye eye-right"></rect>',
      '        <rect x="7" y="6" width="1" height="1" class="eye-hl"></rect>',
      '        <rect x="14" y="6" width="1" height="1" class="eye-hl"></rect>',
      '        <rect x="4" y="8" width="2" height="1" class="blush"></rect>',
      '        <rect x="15" y="8" width="2" height="1" class="blush"></rect>',
      '        <rect x="10" y="9" width="2" height="1" class="ink nose"></rect>',
      '        <rect x="10" y="10" width="2" height="1" class="ink"></rect>',
      '        <rect x="9" y="11" width="4" height="1" class="ink mouth"></rect>',
      '      </g>',
      '      <g class="site-cat__sleep-pixels">',
      '        <rect x="18" y="4" width="3" height="1"></rect>',
      '        <rect x="20" y="5" width="1" height="1"></rect>',
      '        <rect x="18" y="6" width="3" height="1"></rect>',
      '        <rect x="19" y="1" width="2" height="1"></rect>',
      '        <rect x="20" y="2" width="1" height="1"></rect>',
      '        <rect x="19" y="3" width="2" height="1"></rect>',
      '      </g>',
      '    </svg>',
      '  </span>',
      '</button>',
      '<span class="site-cat__laser" aria-hidden="true"></span>',
      '<span class="site-cat__particles" aria-hidden="true"></span>'
    ].join("");
    return root;
  }

  function createManual(cat) {
    const manual = document.createElement("div");
    manual.className = "site-cat-manual";
    manual.innerHTML = [
      '<button class="site-cat-manual__button" type="button" aria-expanded="false">car manual</button>',
      '<div class="site-cat-manual__card" hidden>',
      '  <strong>orange car manual</strong>',
      '  <span>tap: pet / purr</span>',
      '  <span>2nd tap: meow</span>',
      '  <span>5 pats: sleeps</span>',
      '  <span>hold cat: ask a question</span>',
      '  <span>slow cursor: it watches</span>',
      '  <span>fast cursor: it zooms away</span>',
      '  <span>leave it 3s: it sits</span>',
      '</div>'
    ].join("");

    const button = manual.querySelector(".site-cat-manual__button");
    const card = manual.querySelector(".site-cat-manual__card");
    button.addEventListener("click", function () {
      const shouldOpen = card.hidden;
      card.hidden = !shouldOpen;
      button.setAttribute("aria-expanded", String(shouldOpen));
      if (shouldOpen) {
        speak(cat, "manual opened. this car is orange.");
      }
    });
    return manual;
  }

  function setPosition(cat, nextX, nextY) {
    const maxX = Math.max(24, window.innerWidth - cat.offsetWidth - 24);
    const maxY = Math.max(24, window.innerHeight - cat.offsetHeight - 24);
    const moved = Math.hypot((nextX === undefined ? x : nextX) - x, (nextY === undefined ? y : nextY) - y) > 8;
    x = clamp(nextX, 16, maxX);
    y = clamp(nextY === undefined ? y : nextY, 16, maxY);
    cat.style.left = x + "px";
    cat.style.top = y + "px";
    cat.classList.toggle("site-cat--chat-below", y < 190);
    cat.classList.toggle("site-cat--align-right", x + cat.offsetWidth / 2 > window.innerWidth * 0.5);

    if (moved && !reducedMotion.matches) {
      wakeCat(cat);
      cat.classList.add("site-cat--walking");
      window.clearTimeout(movementTimer);
      movementTimer = window.setTimeout(function () {
        cat.classList.remove("site-cat--walking");
      }, 760);
    }
  }

  function face(cat, nextDirection) {
    direction = nextDirection >= 0 ? 1 : -1;
    cat.classList.toggle("site-cat--left", direction < 0);
  }

  function speak(cat, message, duration) {
    const bubble = cat.querySelector(".site-cat__bubble");
    bubble.textContent = message;
    cat.classList.add("site-cat--talking");

    window.clearTimeout(speechTimer);
    speechTimer = window.setTimeout(function () {
      cat.classList.remove("site-cat--talking");
    }, duration || 3600);
  }

  function resetInactivity(cat) {
    if (cat.classList.contains("site-cat--sleeping")) {
      return;
    }

    cat.classList.remove("site-cat--sitting");
    window.clearTimeout(sitTimer);
    sitTimer = window.setTimeout(function () {
      if (!toyMode && !cat.classList.contains("site-cat--chatting") && !cat.classList.contains("site-cat--sleeping")) {
        cat.classList.add("site-cat--sitting");
      }
    }, 3000);
  }

  function wakeCat(cat) {
    cat.classList.remove("site-cat--sitting");
    if (cat.classList.contains("site-cat--sleeping")) {
      cat.classList.remove("site-cat--sleeping");
      speak(cat, "mrrp? awake.");
    }
    resetInactivity(cat);
  }

  function particles(cat, kind) {
    const holder = cat.querySelector(".site-cat__particles");
    const symbols = kind === "spark" ? ["✦", "·", "✧", "·"] : ["♡", "♥", "♡", "♥"];
    holder.innerHTML = symbols.map(function (symbol, index) {
      return '<span style="--i:' + index + '">' + symbol + "</span>";
    }).join("");
    holder.classList.remove("site-cat__particles--burst");
    void holder.offsetWidth;
    holder.classList.add("site-cat__particles--burst");
  }

  function purr(cat) {
    if (!window.AudioContext && !window.webkitAudioContext) {
      return;
    }

    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    const low = audioContext.createOscillator();
    const rumble = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();

    low.type = "sine";
    rumble.type = "triangle";
    low.frequency.setValueAtTime(52, now);
    rumble.frequency.setValueAtTime(104, now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(240, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.035, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);

    low.connect(filter);
    rumble.connect(filter);
    filter.connect(gain);
    gain.connect(audioContext.destination);
    low.start(now);
    rumble.start(now);
    low.stop(now + 0.8);
    rumble.stop(now + 0.8);

    cat.classList.add("site-cat--purring");
    window.setTimeout(function () {
      cat.classList.remove("site-cat--purring");
    }, 900);
  }

  function meow(cat) {
    if (!window.AudioContext && !window.webkitAudioContext) {
      return;
    }

    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    const oscillator = audioContext.createOscillator();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.exponentialRampToValueAtTime(780, now + 0.08);
    oscillator.frequency.exponentialRampToValueAtTime(360, now + 0.28);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.34);

    cat.classList.add("site-cat--meowing");
    window.setTimeout(function () {
      cat.classList.remove("site-cat--meowing");
    }, 420);
  }

  function pet(cat) {
    wakeCat(cat);
    petCount += 1;
    cat.classList.add("site-cat--petted");
    window.setTimeout(function () {
      cat.classList.remove("site-cat--petted");
    }, 520);

    if (petCount % 2 === 0) {
      meow(cat);
      speak(cat, "mew!");
    } else {
      purr(cat);
      speak(cat, "purr purr purr");
    }
    particles(cat, "heart");

    if (petCount % 5 === 0) {
      speak(cat, "five pats. entering loaf-sleep mode.", 4200);
      cat.classList.add("site-cat--sleeping");
      window.clearTimeout(sitTimer);
      window.setTimeout(function () {
        cat.classList.remove("site-cat--sleeping");
        resetInactivity(cat);
      }, 9000);
    }
  }

  function wander(cat) {
    if (reducedMotion.matches || toyMode || cat.classList.contains("site-cat--sitting") || cat.classList.contains("site-cat--sleeping")) {
      return;
    }
    const maxX = Math.max(24, window.innerWidth - cat.offsetWidth - 24);
    const maxY = Math.max(24, window.innerHeight - cat.offsetHeight - 24);
    const stepX = (Math.random() * 2 - 1) * 70;
    const stepY = (Math.random() * 2 - 1) * 55;
    const nextX = clamp(x + stepX, 24, maxX);
    const nextY = clamp(y + stepY, 40, maxY);
    face(cat, nextX - x);
    setPosition(cat, nextX, nextY);
  }

  function dartAway(cat, velocityX, velocityY) {
    if (reducedMotion.matches) {
      return;
    }
    if (cat.classList.contains("site-cat--chatting")) {
      toggleChat(cat, false);
    }
    wakeCat(cat);
    const magnitude = Math.hypot(velocityX, velocityY) || 1;
    const awayX = velocityX / magnitude;
    const awayY = velocityY / magnitude;
    face(cat, awayX);
    setPosition(
      cat,
      x + awayX * (80 + Math.random() * 40),
      y + awayY * (60 + Math.random() * 30)
    );
    cat.classList.add("site-cat--zoom");
    cat.classList.add("site-cat--startled");
    particles(cat, "spark");
    window.clearTimeout(zoomTimer);
    zoomTimer = window.setTimeout(function () {
      cat.classList.remove("site-cat--zoom");
      cat.classList.remove("site-cat--startled");
    }, 720);
  }

  function lookAt(cat, pointerX, pointerY) {
    const rect = cat.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const facingLeft = pointerX - centerX < 0;
    let eyeX = clamp((pointerX - centerX) / 45, -3, 3);
    const eyeY = clamp((pointerY - centerY) / 65, -2, 3);
    // The sprite mirrors (scaleX(-1)) when facing left, so flip the eye offset back
    if (facingLeft) {
      eyeX = -eyeX;
    }
    cat.style.setProperty("--eye-x", eyeX + "px");
    cat.style.setProperty("--eye-y", eyeY + "px");
    face(cat, pointerX - centerX);
  }

  function enableToy(cat) {
    wakeCat(cat);
    toyMode = true;
    cat.classList.add("site-cat--toy-mode");
    speak(cat, "YARN MODE: move your cursor. I am speed.");
    window.clearTimeout(toyTimer);
    toyTimer = window.setTimeout(function () {
      toyMode = false;
      cat.classList.remove("site-cat--toy-mode");
      speak(cat, "yarn defeated. I require snacks.");
    }, 12000);
  }

  function toggleChat(cat, forceOpen) {
    const form = cat.querySelector(".site-cat-chat");
    const log = cat.querySelector(".site-cat-chat__log");
    const input = cat.querySelector(".site-cat-chat__input");
    const shouldOpen = forceOpen === undefined ? form.hidden : forceOpen;

    form.hidden = !shouldOpen;
    cat.classList.toggle("site-cat--chatting", shouldOpen);
    cat.classList.toggle("site-cat--chat-below", y < 190);
    cat.classList.toggle("site-cat--align-right", x + cat.offsetWidth / 2 > window.innerWidth * 0.5);

    if (shouldOpen) {
      wakeCat(cat);
      speak(cat, "ask me about Vansh. I have notes.");
      if (!log.children.length) {
        addChatMessage(log, "cat", "Hi. I can answer from the page now, and from Gemini once the secret backend is connected.");
      }
      window.setTimeout(function () {
        input.focus();
      }, 60);
    }
  }

  function localAnswer(question) {
    const normalized = question.toLowerCase();
    const match = facts.find(function (fact) {
      return fact.keys.some(function (key) {
        return normalized.includes(key);
      });
    });

    if (match) {
      return match.answer;
    }

    return "I know the homepage lore: Vansh is into AI research, graph learning, nearest-neighbor search, machine unlearning, and building ramAIn. Ask me about research, papers, CMU, Copenhagen, YC, or contact.";
  }

  function collectSiteContext() {
    const chunks = Array.from(document.querySelectorAll("title, #Bio, #News, #Publications, #Experience, sectionheading, heading, p, td"))
      .map(function (node) {
        return node.textContent.replace(/\s+/g, " ").trim();
      })
      .filter(Boolean);
    return Array.from(new Set(chunks)).join("\n").slice(0, 9000);
  }

  function addChatMessage(log, role, text) {
    const message = document.createElement("div");
    message.className = "site-cat-chat__message site-cat-chat__message--" + role;
    message.textContent = text;
    log.appendChild(message);
    log.scrollTop = log.scrollHeight;
  }

  async function askCat(question) {
    const response = await fetch(CAT_CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: question,
        context: collectSiteContext()
      })
    });

    if (!response.ok) {
      throw new Error("cat endpoint unavailable");
    }

    const data = await response.json();
    return data.answer || localAnswer(question);
  }

  function setupChat(cat) {
    const form = cat.querySelector(".site-cat-chat");
    const log = cat.querySelector(".site-cat-chat__log");
    const input = cat.querySelector(".site-cat-chat__input");

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const question = input.value.trim();
      if (!question) {
        return;
      }

      input.value = "";
      addChatMessage(log, "human", question);
      addChatMessage(log, "cat", "thinking with one orange braincell...");

      const thinking = log.lastElementChild;
      try {
        const answer = await askCat(question);
        thinking.textContent = answer;
        speak(cat, "answered. pay me in pets.");
      } catch (error) {
        thinking.textContent = localAnswer(question);
        speak(cat, "Gemini nap mode. I answered from local notes.");
      }
    });
  }

  function init() {
    if (document.querySelector(".site-cat")) {
      return;
    }

    const cat = createCat();
    document.body.appendChild(cat);
    document.body.appendChild(createManual(cat));
    setPosition(cat, x, y);
    const petZone = cat.querySelector(".site-cat__pet-zone");
    const laser = cat.querySelector(".site-cat__laser");

    petZone.addEventListener("pointerdown", function () {
      longPressOpened = false;
      window.clearTimeout(longPressTimer);
      longPressTimer = window.setTimeout(function () {
        longPressOpened = true;
        window.clearTimeout(tapTimer);
        toggleChat(cat, true);
      }, 520);
    });

    petZone.addEventListener("pointerup", function () {
      window.clearTimeout(longPressTimer);
    });

    petZone.addEventListener("pointerleave", function () {
      window.clearTimeout(longPressTimer);
    });

    petZone.addEventListener("click", function () {
      if (longPressOpened) {
        longPressOpened = false;
        return;
      }

      window.clearTimeout(tapTimer);
      tapTimer = window.setTimeout(function () {
        pet(cat);
      }, 80);
    });

    document.addEventListener("pointermove", function (event) {
      lookAt(cat, event.clientX, event.clientY);

      if (toyMode) {
        laser.style.left = event.clientX + "px";
        laser.style.top = event.clientY + "px";
        setPosition(cat, event.clientX - cat.offsetWidth / 2, event.clientY - cat.offsetHeight / 2);
        return;
      }

      const rect = petZone.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
      const now = performance.now();
      const previous = lastPointer;
      lastPointer = { x: event.clientX, y: event.clientY, time: now };

      cat.classList.toggle("site-cat--curious", distance < 240);
      if (!previous || cat.classList.contains("site-cat--zoom")) {
        return;
      }

      const dt = Math.max(16, now - previous.time);
      const velocityX = (event.clientX - previous.x) / dt;
      const velocityY = (event.clientY - previous.y) / dt;
      const speed = Math.hypot(velocityX, velocityY);
      const toCatX = centerX - previous.x;
      const toCatY = centerY - previous.y;
      const approaching = velocityX * toCatX + velocityY * toCatY > 0;

      if (distance < 220) {
        resetInactivity(cat);
      }

      if (distance < 120 && speed > 1.35 && approaching) {
        dartAway(cat, velocityX, velocityY);
      }
    });

    document.addEventListener("pointerdown", function (event) {
      if (!toyMode || reducedMotion.matches) {
        return;
      }
      particles(cat, "spark");
      setPosition(cat, event.clientX - cat.offsetWidth / 2, event.clientY - cat.offsetHeight / 2);
      speak(cat, "pounce.");
    });

    window.addEventListener("resize", function () {
      setPosition(cat, x, y);
    });

    // Close the chat when clicking/tapping anywhere outside the cat
    document.addEventListener("pointerdown", function (event) {
      if (cat.classList.contains("site-cat--chatting") && !cat.contains(event.target)) {
        toggleChat(cat, false);
      }
    });

    // Close the chat on Escape
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && cat.classList.contains("site-cat--chatting")) {
        toggleChat(cat, false);
      }
    });

    setupChat(cat);
    resetInactivity(cat);

    idleTimer = window.setInterval(function () {
      if (cat.classList.contains("site-cat--sitting") || cat.classList.contains("site-cat--sleeping") || cat.classList.contains("site-cat--chatting")) {
        return;
      }

      wander(cat);
    }, 7000);

    reducedMotion.addEventListener("change", function () {
      if (reducedMotion.matches) {
        window.clearInterval(idleTimer);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
