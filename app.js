/* ============================================================
   PAPER TRAIL — scrapbook habit tracker
   Vanilla JS. No dependencies. Everything persists to localStorage.
   ============================================================ */
(function () {
  "use strict";

  /* ---------------------------------------------------------
     0. Tiny helpers
     --------------------------------------------------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) =>
    Array.prototype.slice.call((r || document).querySelectorAll(s));
  const uid = () =>
    Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  const p2 = (n) => String(n).padStart(2, "0");
  const dkey = (d) =>
    d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
  const fromKey = (k) => {
    const a = k.split("-").map(Number);
    return new Date(a[0], a[1] - 1, a[2]);
  };
  const addDays = (k, n) => {
    const d = fromKey(k);
    d.setDate(d.getDate() + n);
    return dkey(d);
  };
  const TODAY = () => dkey(new Date());

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const MONL = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const fmtLong = (k) => {
    const d = fromKey(k);
    return MONL[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  };
  const fmtShort = (k) => {
    const d = fromKey(k);
    return MON[d.getMonth()] + " " + d.getDate();
  };
  const weekdayOf = (k) => fromKey(k).getDay();

  /* ---------------------------------------------------------
     1. Palette — the "washer" tray of pastel colours
     --------------------------------------------------------- */
  /* Habit colours live in CSS as [data-c="<key>"] custom-property blocks, in both
     themes. JS only ever emits the key, so switching themes is a single attribute
     flip on <html> — no re-render, no repaint of any chart. */
  const PALETTE = [
    "blush",
    "clay",
    "butter",
    "moss",
    "sage",
    "sky",
    "lilac",
    "berry",
  ];
  const colOf = (i) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];

  const EMOJI = [
    "🧘",
    "💧",
    "🏃",
    "📖",
    "😴",
    "🥗",
    "✍️",
    "🧹",
    "🧠",
    "🎸",
    "💪",
    "🚿",
    "🌿",
    "☀️",
    "🧴",
    "💊",
    "🧴",
    "🪴",
    "🐶",
    "🚭",
    "💰",
    "🧘‍♂️",
    "🦷",
    "🎯",
    "🍎",
    "🎹",
    "🧦",
    "📷",
  ];
  const EMOJI_NEW = ["✦", "🌟", "🫧", "🧩", "🪞", "🕯️", "🌈", "🍃"];

  /* ---------------------------------------------------------
     2. State + storage
     --------------------------------------------------------- */
  const KEY = "papertrail.habits.v1";
  const SCHEMA = 1;

  let S = { schema: SCHEMA, habits: [], columns: [], entries: {}, born: null };
  let range = 7; // 0 = all
  let painting = null; // drag-paint value
  let hoverIdx = -1;

  function blank() {
    return {
      schema: SCHEMA,
      habits: [],
      columns: [],
      entries: {},
      born: TODAY(),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || typeof d !== "object") return false;
      S = {
        schema: SCHEMA,
        born: d.born || TODAY(),
        habits: Array.isArray(d.habits)
          ? d.habits.filter((h) => h && h.id && h.name)
          : [],
        columns: Array.isArray(d.columns)
          ? d.columns.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
          : [],
        entries: d.entries && typeof d.entries === "object" ? d.entries : {},
      };
      return true;
    } catch (e) {
      console.warn("[paper trail] could not read saved data", e);
      return false;
    }
  }

  let saveTimer = null;
  function save() {
    const pill = $("#savePill"),
      txt = $("#saveText");
    pill.classList.add("flash");
    txt.textContent = "saving";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(S));
        txt.textContent = "saved";
      } catch (e) {
        txt.textContent = "save failed";
        toast("Storage is full or blocked — download a backup now.");
      }
      setTimeout(() => pill.classList.remove("flash"), 700);
    }, 90);
  }

  function saveNow() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {
      /* handled by toast elsewhere */
    }
  }

  /* ---------------------------------------------------------
     3. Data helpers
     --------------------------------------------------------- */
  const isDone = (k, hid) => !!(S.entries[k] && S.entries[k][hid]);

  function setDone(k, hid, val) {
    if (!S.entries[k]) S.entries[k] = {};
    if (val) S.entries[k][hid] = 1;
    else delete S.entries[k][hid];
    if (!Object.keys(S.entries[k]).length) delete S.entries[k];
    save();
  }

  function toggle(k, hid) {
    setDone(k, hid, !isDone(k, hid));
  }

  /** Streak ending today (or yesterday, if today isn't stamped yet). */
  function streakOf(hid) {
    let k = TODAY(),
      n = 0;
    if (!isDone(k, hid)) k = addDays(k, -1);
    let guard = 0;
    while (isDone(k, hid) && guard++ < 4000) {
      n++;
      k = addDays(k, -1);
    }
    return n;
  }

  function bestStreakOf(hid) {
    const keys = sortedCols().filter((k) => k <= TODAY());
    let run = 0,
      best = 0;
    for (let i = 0; i < keys.length; i++) {
      const contiguous = i === 0 || keys[i] === addDays(keys[i - 1], 1);
      run =
        contiguous && isDone(keys[i], hid)
          ? run + 1
          : isDone(keys[i], hid)
            ? 1
            : 0;
      if (run > best) best = run;
    }
    return best;
  }

  function sortedCols() {
    return S.columns.slice().sort();
  }
  function habitById(id) {
    return S.habits.filter((h) => h.id === id)[0];
  }

  /** Fill in any missing days so the board & streaks stay continuous. */
  function syncColumns() {
    const t = TODAY();
    let start = t;
    S.columns.forEach((k) => {
      if (k < start) start = k;
    });
    S.habits.forEach((h) => {
      if (h.createdAt && h.createdAt < start) start = h.createdAt;
    });
    const floor = addDays(t, -400);
    if (start < floor) start = floor;

    // always show at least the last 5 weeks
    const nice = addDays(t, -34);
    if (start > nice) start = nice;

    const set = new Set(S.columns);
    for (let k = start; k <= t; k = addDays(k, 1)) set.add(k);
    set.add(t);
    S.columns = Array.from(set).sort();
  }

  /* ---------------------------------------------------------
     4. First run — a demo book so the charts aren't empty
     --------------------------------------------------------- */
  function seed() {
    const t = TODAY();
    const defs = [
      { name: "Drink 2L water", emoji: "💧", c: 5 },
      { name: "Move for 30 min", emoji: "🏃", c: 0 },
      { name: "Read 20 pages", emoji: "📖", c: 6 },
      { name: "In bed by 11pm", emoji: "😴", c: 7 },
      { name: "No phone 1st hr", emoji: "🌿", c: 3 },
    ];
    S = blank();
    S.habits = defs.map((d, i) => ({
      id: "demo-" + (i + 1),
      name: d.name,
      emoji: d.emoji,
      color: d.c,
      createdAt: addDays(t, -30 + i * 2),
    }));

    // Correlated history: motivation arrives in waves, so model each habit as a
    // slow random walk over "mood" rather than independent per-day coin flips.
    // Independent noise gives 1-2 day streaks and makes the board look lifeless.
    S.habits.forEach((h) => {
      let mood = (pseudo(h.id + ":start") - 0.5) * 1.1;
      for (let i = 34; i >= 1; i--) {
        // today is left blank for you
        const k = addDays(t, -i);
        mood = clamp(
          mood + (pseudo(h.id + ":mood" + k) - 0.5) * 0.52,
          -1.15,
          1.15,
        );
        const p = clamp(0.5 + mood * 0.42, 0.03, 0.97);
        if (pseudo(h.id + ":s" + k) < p) {
          if (!S.entries[k]) S.entries[k] = {};
          S.entries[k][h.id] = 1;
        }
      }
    });
    syncColumns();
    saveNow();
  }

  /** Stable pseudo-random so the demo looks identical every time. */
  function pseudo(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  /* ---------------------------------------------------------
     5. Render — stats
     --------------------------------------------------------- */
  function renderStats() {
    const t = TODAY();
    const live = S.habits;
    const doneToday = live.filter((h) => isDone(t, h.id)).length;
    const pct = live.length ? Math.round((doneToday / live.length) * 100) : 0;

    const C = 2 * Math.PI * 41;
    const ring = $("#todayRing");
    ring.style.strokeDasharray = C.toFixed(1);
    ring.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(1);
    // the ring borrows the first habit's colour via [data-c]; CSS supplies it
    $("#todayRingWrap").dataset.c = live.length ? colOf(live[0].color) : "";
    $("#todayPct").textContent = pct + "%";
    $("#todayNote").textContent = live.length
      ? doneToday === live.length
        ? "every habit stamped. beautiful."
        : doneToday === 0
          ? "nothing stamped yet today"
          : doneToday + " of " + live.length + " stamped today"
      : "add your first habit to begin";

    // longest active streak
    let best = 0,
      who = null;
    live.forEach((h) => {
      const s = streakOf(h.id);
      if (s > best) {
        best = s;
        who = h;
      }
    });
    $("#bestStreak").textContent = best;
    $("#streakWho").textContent = best
      ? who.emoji + "  " + who.name + (best === 1 ? " — day one" : "")
      : "stamp a box to start one";

    // totals
    let stamps = 0;
    for (const k in S.entries) for (const h in S.entries[k]) stamps++;
    $("#totalStamps").textContent = stamps.toLocaleString();
    const first = sortedCols()[0];
    const days = first
      ? Math.round((fromKey(TODAY()) - fromKey(first)) / 864e5) + 1
      : 0;
    $("#stampsNote").textContent = stamps
      ? "since " + fmtShort(first)
      : "all time";

    $("#daysTracked").textContent = days.toLocaleString();
    $("#habitCount").textContent = live.length;
    $("#volNo").textContent = p2(Math.min(99, 1 + Math.floor(days / 30)));
    $("#mastDate").textContent = fmtLong(TODAY());

    const bestTotal = live.reduce((a, h) => a + bestStreakOf(h.id), 0);
    $("#dataSub").textContent = live.length
      ? live.length +
        " habit" +
        (live.length > 1 ? "s" : "") +
        " · " +
        days +
        " days · " +
        stamps +
        " stamps · best-ever streak " +
        bestTotal +
        " days"
      : "nothing saved yet";
  }

  /* ---------------------------------------------------------
     6. Render — the grid
     --------------------------------------------------------- */
  function cellHTML(hid, k) {
    const on = isDone(k, hid);
    const future = k > TODAY();
    const today = k === TODAY();
    const monthEdge = k.slice(8) === "01";
    const cls = [
      "cell",
      on ? "on" : "",
      today ? "is-today" : "",
      future ? "is-future" : "",
      monthEdge ? "is-month" : "",
    ].join(" ");
    return (
      '<button type="button" class="' +
      cls +
      '" data-h="' +
      hid +
      '" data-d="' +
      k +
      '" ' +
      'aria-pressed="' +
      on +
      '" ' +
      'aria-label="' +
      esc(fmtLong(k) + " — " + habitName(hid)) +
      '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M20 6 9 17l-5-5"/></svg></button>'
    );
  }

  function habitName(id) {
    const h = habitById(id);
    return h ? h.name : "deleted habit";
  }

  function renderGrid() {
    const cols = sortedCols();
    const scroller = $("#gridScroll");
    const prevL = scroller.scrollLeft,
      prevT = scroller.scrollTop;
    const stickRight = prevL + scroller.clientWidth >= scroller.scrollWidth - 8;

    /* head */
    let head =
      '<tr><th class="corner"><span class="corner-label">habit \\ day</span></th>';
    cols.forEach((k) => {
      const d = fromKey(k);
      const monthEdge = d.getDate() === 1;
      head +=
        '<th scope="col" class="' +
        (k === TODAY() ? "is-today " : "") +
        (k > TODAY() ? "is-future " : "") +
        (monthEdge ? "is-month" : "") +
        '" title="' +
        fmtLong(k) +
        '">' +
        '<span class="dow">' +
        DOW[d.getDay()] +
        "</span>" +
        '<span class="dnum">' +
        d.getDate() +
        "</span>" +
        (d.getDate() === 1 || d === cols[0]
          ? '<span class="dmon">' + MON[d.getMonth()] + "</span>"
          : "") +
        "</th>";
    });
    head +=
      '<th class="addcol"><button type="button" id="addColInline" title="Add a column" aria-label="Add a column">＋</button></th></tr>';
    $("#gridHead").innerHTML = head;

    /* body */
    let body = "";
    S.habits.forEach((h) => {
      const c = colOf(h.color);
      const st = streakOf(h.id);
      // data-c on the <tr> lets both the sticky name cell and every date cell in
      // the row inherit that habit's colour, in either theme
      body +=
        '<tr data-row="' +
        h.id +
        '" data-c="' +
        c +
        '">' +
        '<td class="hcell"><div class="hrow">' +
        '<span class="hemoji">' +
        esc(h.emoji || "✦") +
        "</span>" +
        '<span class="hmeta"><span class="hname">' +
        esc(h.name) +
        "</span>" +
        '<span class="hsub"><span class="hstreak' +
        (st ? "" : " cold") +
        '">' +
        (st ? "🔥 " + st + "d" : "0d") +
        "</span>" +
        "<span>·</span><span>" +
        pctOf(h.id, range) +
        "%</span></span>" +
        "</span>" +
        '<button type="button" class="hdel" data-del="' +
        h.id +
        '" title="Remove habit" aria-label="Remove ' +
        esc(h.name) +
        '">✕</button>' +
        "</div></td>";
      cols.forEach((k) => {
        body += "<td>" + cellHTML(h.id, k) + "</td>";
      });
      body += "<td></td></tr>";
    });
    $("#gridBody").innerHTML = body;

    /* foot */
    $("#gridFoot").innerHTML =
      '<tr><td class="hcell">' +
      '<button type="button" class="addrow" id="addRowInline"><span class="plus">＋</span> Add a row — a new habit</button>' +
      '</td><td colspan="' +
      (cols.length + 1) +
      '"></td></tr>';

    // restore scroll
    scroller.scrollTop = prevT;
    scroller.scrollLeft = stickRight ? scroller.scrollWidth : prevL;
    if (stickRight) scroller.scrollLeft = scroller.scrollWidth;
  }

  /** completion % for a habit across the active range */
  function pctOf(hid, days) {
    const all = sortedCols().filter((k) => k <= TODAY());
    const slice = days ? all.slice(-days) : all;
    if (!slice.length) return 0;
    let n = 0;
    slice.forEach((k) => {
      if (isDone(k, hid)) n++;
    });
    return Math.round((n / slice.length) * 100);
  }

  /* ---------------------------------------------------------
     7. Charts
     --------------------------------------------------------- */
  function series() {
    const all = sortedCols().filter((k) => k <= TODAY());
    if (!all.length) return [];
    const slice = range ? all.slice(-range) : all;
    const live = S.habits;
    return slice.map((k) => {
      let done = 0;
      live.forEach((h) => {
        if (isDone(k, h.id)) done++;
      });
      return {
        k,
        done,
        total: live.length,
        r: live.length ? done / live.length : 0,
      };
    });
  }

  function renderTrend() {
    const host = $("#trendChart");
    const data = series();
    const label = range
      ? "last " + range + " days"
      : "all " + data.length + " days";

    if (!data.length || !S.habits.length) {
      host.innerHTML =
        '<p class="bars-empty">Add a habit and stamp a few days — the line shows up here.</p>';
      $("#trendBadge").textContent = "—";
      $("#trendSub").textContent = "share of habits stamped, per day";
      return;
    }

    const avg = data.reduce((a, d) => a + d.r, 0) / data.length;
    $("#trendBadge").textContent = Math.round(avg * 100) + "% avg · " + label;
    $("#trendSub").textContent = "share of habits stamped per day";

    // Size the viewBox to the real container so 9px labels render at 9px.
    // A fixed 720-unit viewBox scaled down to a ~460px card shrank them to ~6px.
    const W = clamp(Math.round(host.clientWidth) || 520, 300, 940);
    const H = clamp(Math.round(W * 0.52), 200, 300);
    const L = 38,
      R = 16,
      T = 18,
      B = 34;
    const iw = W - L - R,
      ih = H - T - B;
    const n = data.length;
    const X = (i) => (n === 1 ? L + iw / 2 : L + (i / (n - 1)) * iw);
    const Y = (v) => T + ih * (1 - v);

    const pts = data.map((d, i) => [X(i), Y(d.r)]);
    let line = "";
    if (pts.length === 1) {
      line =
        "M" +
        pts[0][0] +
        "," +
        (pts[0][1] + 8) +
        " L" +
        pts[0][0] +
        "," +
        pts[0][1];
    } else {
      line = "M" + pts[0][0] + "," + pts[0][1];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i],
          p1 = pts[i],
          p2 = pts[i + 1],
          p3 = pts[i + 2] || p2;
        const t = 0.18;
        line +=
          " C" +
          (p1[0] + (p2[0] - p0[0]) * t) +
          "," +
          (p1[1] + (p2[1] - p0[1]) * t) +
          " " +
          (p2[0] - (p3[0] - p1[0]) * t) +
          "," +
          (p2[1] - (p3[1] - p1[1]) * t) +
          " " +
          p2[0] +
          "," +
          p2[1];
      }
    }
    const area =
      line +
      " L" +
      X(n - 1) +
      "," +
      (T + ih) +
      " L" +
      X(0) +
      "," +
      (T + ih) +
      " Z";

    let grid = "";
    [0, 0.25, 0.5, 0.75, 1].forEach((v) => {
      const y = Y(v);
      grid +=
        '<line class="' +
        (v === 0 ? "t-base" : "t-grid") +
        '" x1="' +
        L +
        '" y1="' +
        y.toFixed(1) +
        '" x2="' +
        (W - R) +
        '" y2="' +
        y.toFixed(1) +
        '"/>';
      grid +=
        '<text class="t-ylab" x="' +
        (L - 9) +
        '" y="' +
        (y + 3.2).toFixed(1) +
        '" text-anchor="end">' +
        v * 100 +
        "</text>";
    });

    const step = Math.max(1, Math.ceil(n / Math.max(3, Math.floor(iw / 58))));
    let xlab = "";
    data.forEach((d, i) => {
      if (i % step && i !== n - 1) return;
      const dt = fromKey(d.k);
      xlab +=
        '<text class="t-xlab" x="' +
        X(i).toFixed(1) +
        '" y="' +
        (T + ih + 16) +
        '" text-anchor="middle">' +
        (dt.getDate() === 1 || i === 0 ? MON[dt.getMonth()] + " " : "") +
        dt.getDate() +
        "</text>";
    });

    let dots = "";
    data.forEach((d, i) => {
      if (!d.total) return;
      const last = i === n - 1;
      dots +=
        '<circle class="' +
        (last ? "t-dot-last" : "t-dot") +
        '" cx="' +
        X(i).toFixed(1) +
        '" cy="' +
        Y(d.r).toFixed(1) +
        '" r="' +
        (last ? 4.2 : 2.9) +
        '" data-i="' +
        i +
        '"/>';
    });

    let hits = "";
    data.forEach((d, i) => {
      const w = n === 1 ? iw : iw / (n - 1);
      hits +=
        '<rect class="t-hit" data-i="' +
        i +
        '" x="' +
        (X(i) - w / 2).toFixed(1) +
        '" y="' +
        T +
        '" width="' +
        w.toFixed(1) +
        '" height="' +
        ih +
        '"/>';
    });

    host.innerHTML =
      '<svg class="trend" viewBox="0 0 ' +
      W +
      " " +
      H +
      '" role="img" aria-label="Consistency over ' +
      label +
      '">' +
      /* currentColor, so the whole chart re-themes from --accent with no redraw */
      '<defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="currentColor" stop-opacity=".26"/>' +
      '<stop offset="100%" stop-color="currentColor" stop-opacity="0"/>' +
      "</linearGradient></defs>" +
      grid +
      xlab +
      '<path d="' +
      area +
      '" fill="url(#tg)"/>' +
      '<path d="' +
      line +
      '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<line class="t-guide" id="tGuide" x1="0" y1="' +
      T +
      '" x2="0" y2="' +
      (T + ih) +
      '" style="opacity:0"/>' +
      dots +
      hits +
      "</svg>";

    // hover — map SVG user units to screen space via getScreenCTM so the
    // tooltip stays accurate at any viewport size / aspect ratio.
    const svg = host.querySelector("svg"),
      guide = host.querySelector("#tGuide");
    const toScreen = (ux, uy) => {
      const p = svg.createSVGPoint();
      p.x = ux;
      p.y = uy;
      const m = svg.getScreenCTM();
      return m ? p.matrixTransform(m) : { x: 0, y: 0 };
    };
    $$(".t-hit", svg).forEach((r) => {
      const move = () => {
        const i = +r.getAttribute("data-i");
        hoverIdx = i;
        const d = data[i];
        guide.setAttribute("x1", X(i));
        guide.setAttribute("x2", X(i));
        guide.style.opacity = 1;
        const s = toScreen(X(i), Y(d.r));
        showTip(TT_DAY(d), s.x, s.y, true);
      };
      r.addEventListener("mouseenter", move);
      r.addEventListener("focus", move);
    });
    svg.addEventListener("mouseleave", () => {
      guide.style.opacity = 0;
      hoverIdx = -1;
      hideTip();
    });
    svg.addEventListener("pointerdown", () => {
      guide.style.opacity = 0;
      hideTip();
    });
  }

  function TT_DAY(d) {
    let h = '<span class="tt-d">' + fmtLong(d.k) + "</span>";
    if (!d.total) {
      h += '<span class="tt-r">no habits yet</span>';
      return h;
    }
    h +=
      "<b>" +
      Math.round(d.r * 100) +
      "%</b> · " +
      d.done +
      "/" +
      d.total +
      " habits";
    S.habits.forEach((hb) => {
      h +=
        '<span class="tt-r" data-c="' +
        colOf(hb.color) +
        '"><i></i>' +
        esc(hb.emoji + " " + hb.name) +
        (isDone(d.k, hb.id) ? " ✓" : "") +
        "</span>";
    });
    return h;
  }

  function renderBars() {
    const host = $("#barsChart");
    if (!S.habits.length) {
      host.innerHTML = '<p class="bars-empty">Nothing in the book yet.</p>';
      return;
    }
    const label = range ? "last " + range + " days" : "all time";
    $("#barsSub").textContent = "completion rate over the " + label;

    host.innerHTML = S.habits
      .map((h) => {
        const p = pctOf(h.id, range);
        return (
          '<div class="bar-row" data-c="' +
          colOf(h.color) +
          '">' +
          '<span class="bar-top"><span class="bar-emoji">' +
          esc(h.emoji || "✦") +
          "</span>" +
          '<span class="bar-name">' +
          esc(h.name) +
          "</span></span>" +
          '<span class="bar-pct">' +
          p +
          "%</span>" +
          '<span class="bar-track"><span class="bar-fill" data-w="' +
          p +
          '"></span></span>' +
          "</div>"
        );
      })
      .join("");

    $$(".bar-fill", host).forEach((b) => {
      requestAnimationFrame(() => {
        b.style.width = b.getAttribute("data-w") + "%";
      });
    });
  }

  function renderHeat(fixed) {
    const host = $("#heatChart");
    if (!S.habits.length) {
      host.innerHTML = '<p class="bars-empty">Nothing in the book yet.</p>';
      return;
    }

    // Pick a window that fills the card. Cells are capped at 18px + 3px gap = 21px
    // per week column, so the card never overflows (it would just scroll).
    const wrapW = host.clientWidth || 900;
    const weeks = fixed || clamp(Math.floor((wrapW - 188) / 21), 12, 52);
    $("#heatWeeks").textContent =
      weeks === 52 ? "the last 52 weeks" : "the last " + weeks + " weeks";

    const t = fromKey(TODAY());
    const dowIdx = (t.getDay() + 6) % 7; // Monday = 0
    const lastWeek = addDays(TODAY(), -dowIdx);
    const start = addDays(lastWeek, -(weeks - 1) * 7);
    const tKey = TODAY();
    const DOW_S = ["M", "", "W", "", "F", "", "S"];

    // month scale across the week columns
    let months = '<div class="heat-months">';
    let prevM = -1;
    for (let w = 0; w < weeks; w++) {
      const m = fromKey(addDays(start, w * 7)).getMonth();
      months +=
        '<span class="heat-month">' + (m !== prevM ? MON[m] : "") + "</span>";
      prevM = m;
    }
    months += "</div>";

    // one block per habit: 7 weekday rows x `weeks` week-columns
    let blocks = "";
    S.habits.forEach((h) => {
      const c = colOf(h.color);
      let grid = "";
      for (let d = 0; d < 7; d++) {
        grid += '<span class="heat-dow">' + DOW_S[d] + "</span>";
        for (let w = 0; w < weeks; w++) {
          const k = addDays(start, w * 7 + d);
          const done = isDone(k, h.id);
          const future = k > tKey;
          grid +=
            '<span class="heat-cell' +
            (done ? " d1" : "") +
            (future ? " future" : "") +
            '" data-h="' +
            h.id +
            '" data-d="' +
            k +
            '"></span>';
        }
      }
      blocks +=
        '<div class="heat-block" data-c="' +
        c +
        '">' +
        '<span class="heat-blabel"><span class="heat-hname">' +
        esc(h.emoji + " " + h.name) +
        "</span></span>" +
        '<div class="heat-grid" style="--wks:' +
        weeks +
        '">' +
        grid +
        "</div></div>";
    });

    host.innerHTML =
      '<div class="heat">' +
      months +
      blocks +
      "</div>" +
      '<div class="heat-legend"><span>less</span>' +
      '<i class="lg-empty"></i>' +
      '<i data-c="blush"></i><i data-c="sky"></i>' +
      '<i data-c="sage"></i><i data-c="lilac"></i>' +
      '<i data-c="clay"></i><span>more</span></div>';

    $$(".heat-cell", host).forEach((cell) => {
      cell.addEventListener("mouseenter", () => {
        const k = cell.getAttribute("data-d");
        const h = habitById(cell.getAttribute("data-h"));
        if (!h) return;
        const done = isDone(k, h.id);
        const r = cell.getBoundingClientRect();
        showTip(
          '<span class="tt-d">' +
            fmtLong(k) +
            '</span><span class="tt-r" data-c="' +
            colOf(h.color) +
            '"><i></i>' +
            esc(h.emoji + " " + h.name) +
            " — <b>" +
            (done ? "stamped" : "not stamped") +
            "</b></span>",
          r.left + r.width / 2,
          r.top,
        );
      });
      cell.addEventListener("mouseleave", hideTip);
    });
  }

  /* ---------------------------------------------------------
     8. Tooltip + toast
     --------------------------------------------------------- */
  const tip = $("#tooltip");
  function showTip(html, x, y, below) {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let left = x - r.width / 2;
    left = clamp(left, 10, window.innerWidth - r.width - 10);
    let top = below ? y + 16 : y - r.height - 12;
    if (top < 10) top = y + 18;
    if (top + r.height > window.innerHeight - 10)
      top = window.innerHeight - r.height - 10;
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() {
    tip.hidden = true;
  }

  let toastT = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  /* ---------------------------------------------------------
     9. Master render
     --------------------------------------------------------- */
  let rafPending = false;
  function renderAll() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      doRender();
    });
  }
  function doRender() {
    renderStats();
    renderGrid();
    renderTrend();
    renderBars();
    renderHeat();
  }

  /* ---------------------------------------------------------
     10. Interaction — stamping (click + drag paint)
     --------------------------------------------------------- */
  function applyCell(k, hid, val) {
    const was = isDone(k, hid);
    if (was === val) return;
    setDone(k, hid, val);
    const btn = document.querySelector(
      '.cell[data-h="' + hid + '"][data-d="' + k + '"]',
    );
    if (btn) {
      btn.classList.toggle("on", val);
      btn.setAttribute("aria-pressed", String(val));
      btn.classList.remove("just");
      void btn.offsetWidth;
      btn.classList.add("just");
    }
    renderStats();
    scheduleCharts();
  }

  let chartT = null;
  function scheduleCharts() {
    clearTimeout(chartT);
    chartT = setTimeout(() => {
      renderTrend();
      renderBars();
    }, 140);
  }

  document.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest && e.target.closest(".cell");
    if (!cell) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    const hid = cell.getAttribute("data-h"),
      k = cell.getAttribute("data-d");
    painting = !isDone(k, hid);
    applyCell(k, hid, painting);
  });

  document.addEventListener(
    "pointermove",
    (e) => {
      if (painting === null) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el && el.closest ? el.closest(".cell") : null;
      if (!cell) return;
      const hid = cell.getAttribute("data-h"),
        k = cell.getAttribute("data-d");
      if (isDone(k, hid) !== painting) applyCell(k, hid, painting);
    },
    { passive: true },
  );

  const endPaint = () => {
    if (painting === null) return;
    painting = null;
    renderStats();
    renderGrid();
    renderTrend();
    renderBars();
    renderHeat();
  };
  document.addEventListener("pointerup", endPaint);
  document.addEventListener("pointercancel", endPaint);
  window.addEventListener("blur", endPaint);

  // keyboard activation (click with no pointer detail)
  $("#grid").addEventListener("click", (e) => {
    if (e.detail !== 0) return; // pointer already handled it
    const cell = e.target.closest(".cell");
    if (cell) {
      const hid = cell.getAttribute("data-h"),
        k = cell.getAttribute("data-d");
      toggle(k, hid);
      renderStats();
      renderGrid();
      renderTrend();
      renderBars();
      renderHeat();
      const again = document.querySelector(
        '.cell[data-h="' + hid + '"][data-d="' + k + '"]',
      );
      if (again) again.focus();
    }
  });

  // delete a habit row
  $("#gridBody").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (!del) return;
    const h = habitById(del.getAttribute("data-del"));
    if (!h) return;
    if (
      !confirm(
        'Remove "' +
          h.name +
          '" from the book?\n\nIts stamps stay in your backup data, but the row disappears.',
      )
    )
      return;
    S.habits = S.habits.filter((x) => x.id !== h.id);
    save();
    doRender();
    toast(h.emoji + " " + h.name + " removed");
  });

  // "+" buttons
  document.addEventListener("click", (e) => {
    if (e.target.closest("#addRowInline") || e.target.closest("#addHabitBtn"))
      openHabitModal();
    if (e.target.closest("#addColInline")) openAddDay();
  });

  /* ---------------------------------------------------------
     11. Popover plumbing
     --------------------------------------------------------- */
  const pop = $("#addDayPop"),
    dataPop = $("#dataPop");
  let openPop = null;

  function place(popEl, anchor) {
    popEl.hidden = false;
    const a = anchor.getBoundingClientRect();
    const p = popEl.getBoundingClientRect();
    let left = a.left + a.width / 2 - p.width / 2;
    left = clamp(left, 12, window.innerWidth - p.width - 12);
    let top = a.bottom + 10;
    if (top + p.height > window.innerHeight - 12)
      top = Math.max(12, a.top - p.height - 10);
    popEl.style.left = left + "px";
    popEl.style.top = top + "px";
  }

  function openAddDay(anchor) {
    closePop();
    openPop = "day";
    pop.hidden = false;
    const a = anchor || $("#addDayBtn");
    $("#dayInput").value =
      S.columns.indexOf(TODAY()) >= 0 &&
      S.columns.indexOf(TODAY()) === S.columns.length - 1
        ? addDays(TODAY(), 1)
        : nextFreeDay();
    place(pop, a);
    $("#addDayBtn").setAttribute("aria-expanded", "true");
    setTimeout(() => $("#dayInput").focus(), 30);
  }

  function nextFreeDay() {
    const s = sortedCols();
    return s.length ? addDays(s[s.length - 1], 1) : TODAY();
  }

  function openData(anchor) {
    closePop();
    openPop = "data";
    dataPop.hidden = false;
    place(dataPop, anchor || $("#dataBtn"));
    $("#dataBtn").setAttribute("aria-expanded", "true");
  }

  function closePop() {
    pop.hidden = true;
    dataPop.hidden = true;
    openPop = null;
    $("#addDayBtn").setAttribute("aria-expanded", "false");
    $("#dataBtn").setAttribute("aria-expanded", "false");
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("#addDayBtn")) {
      e.stopPropagation();
      openAddDay();
      return;
    }
    if (e.target.closest("#dataBtn")) {
      e.stopPropagation();
      openData();
      return;
    }
    if (!e.target.closest(".popover")) closePop();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePop();
      closeModal();
    }
  });

  /* quick chips + confirm for a new column */
  $("#dayConfirm").addEventListener("click", () => {
    const v = $("#dayInput").value;
    if (!v) {
      toast("Pick a date first");
      return;
    }
    addColumn(v);
  });
  $("#dayInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("#dayConfirm").click();
    }
  });
  $$("#addDayPop .chip").forEach((ch) =>
    ch.addEventListener("click", () => {
      $("#dayInput").value = addDays(TODAY(), +ch.getAttribute("data-quick"));
    }),
  );

  function addColumn(dateStr) {
    if (!S.columns.includes(dateStr)) {
      S.columns.push(dateStr);
      S.columns.sort();
    }
    syncColumns();
    save();
    closePop();
    doRender();
    // scroll the new column into view
    requestAnimationFrame(() => {
      const cell =
        document.querySelector('.cell[data-d="' + dateStr + '"]') ||
        $('#gridHead th[title="' + fmtLong(dateStr) + '"]');
      if (cell && cell.scrollIntoView)
        cell.scrollIntoView({
          block: "nearest",
          inline: "center",
          behavior: "smooth",
        });
    });
    toast(
      dateStr === TODAY()
        ? "today is already a column ✦"
        : "column added · " + fmtShort(dateStr),
    );
  }

  /* ---------------------------------------------------------
     12. Habit modal
     --------------------------------------------------------- */
  const modal = $("#habitModal"),
    scrim = $("#scrim");
  let draft = { emoji: "🧘", color: S.habits.length % PALETTE.length };

  function openHabitModal() {
    closePop();
    draft = {
      emoji: EMOJI_NEW[S.habits.length % EMOJI_NEW.length],
      color: S.habits.length % PALETTE.length,
    };
    $("#habitName").value = "";
    $("#habitModalTitle").textContent = "Add a habit";
    $("#habitConfirm").textContent = "Add row";
    buildEmojiGrid();
    buildSwatches();
    syncPreview();
    scrim.hidden = false;
    modal.hidden = false;
    setTimeout(() => $("#habitName").focus(), 40);
  }
  function closeModal() {
    modal.hidden = true;
    scrim.hidden = true;
  }

  function buildEmojiGrid() {
    $("#emojiGrid").innerHTML = EMOJI.concat(EMOJI_NEW)
      .map(
        (e) =>
          '<button type="button" data-e="' +
          e +
          '" class="' +
          (e === draft.emoji ? "on" : "") +
          '" aria-label="Sticker ' +
          e +
          '">' +
          e +
          "</button>",
      )
      .join("");
  }
  function buildSwatches() {
    // data-i is the palette index; data-c is the CSS hook for the colour key
    $("#swatches").innerHTML = PALETTE.map(
      (key, i) =>
        '<button type="button" data-i="' +
        i +
        '" data-c="' +
        key +
        '" class="' +
        (i === draft.color ? "on" : "") +
        '" title="' +
        key +
        '" aria-label="Colour ' +
        key +
        '"></button>',
    ).join("");
  }
  function syncPreview() {
    const pv = $("#habitPreview");
    pv.dataset.c = colOf(draft.color);
    pv.querySelector(".pv-emoji").textContent = draft.emoji;
    pv.querySelector(".pv-name").textContent =
      $("#habitName").value.trim() || "Your new habit";
    pv.querySelector(".pv-streak").textContent = "0d streak";
  }

  $("#habitName").addEventListener("input", syncPreview);
  $("#emojiGrid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-e]");
    if (!b) return;
    draft.emoji = b.getAttribute("data-e");
    $$("#emojiGrid button").forEach((x) => x.classList.toggle("on", x === b));
    syncPreview();
  });
  $("#swatches").addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    draft.color = +b.getAttribute("data-i");
    $$("#swatches button").forEach((x) => x.classList.toggle("on", x === b));
    syncPreview();
  });
  $("#habitConfirm").addEventListener("click", () => {
    const name = $("#habitName").value.trim() || "Untitled habit";
    S.habits.push({
      id: uid(),
      name,
      emoji: draft.emoji,
      color: draft.color,
      createdAt: TODAY(),
    });
    syncColumns();
    save();
    closeModal();
    doRender();
    requestAnimationFrame(() => {
      const row = $("#gridBody tr:last-child .hcell");
      if (row) {
        row.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "smooth",
        });
      }
    });
    toast(draft.emoji + '  "' + name + '" added as a new row');
  });
  $("#habitName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("#habitConfirm").click();
    }
  });
  scrim.addEventListener("click", closeModal);
  $$(".popover [data-close], .modal [data-close]").forEach((b) =>
    b.addEventListener("click", () => {
      closePop();
      closeModal();
    }),
  );

  /* ---------------------------------------------------------
     12b. Theme

     The theme is one attribute on <html>. Every colour in the app resolves
     through CSS custom properties, so switching is a single repaint — no
     render, no chart rebuild. The initial value is resolved by an inline
     script in <head> so there is no flash of the wrong palette.
     --------------------------------------------------------- */
  const THEME_KEY = "papertrail.theme";
  const themeBtn = $("#themeToggle");

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function applyTheme(next, persist) {
    document.documentElement.dataset.theme = next;
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* private mode — the theme just won't survive a reload */
      }
    }
    themeBtn.setAttribute(
      "aria-label",
      next === "dark" ? "Switch to light mode" : "Switch to dark mode",
    );
  }

  applyTheme(currentTheme(), false);

  themeBtn.addEventListener("click", () =>
    applyTheme(currentTheme() === "dark" ? "light" : "dark", true),
  );

  // Follow the OS only while the user hasn't made an explicit choice.
  const osScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const onScheme = (e) => {
    let stored = null;
    try {
      stored = localStorage.getItem(THEME_KEY);
    } catch (err) {
      /* ignore */
    }
    if (!stored) applyTheme(e.matches ? "dark" : "light", false);
  };
  if (osScheme.addEventListener) osScheme.addEventListener("change", onScheme);
  else if (osScheme.addListener) osScheme.addListener(onScheme);

  /* ---------------------------------------------------------
     13. Range segmented control
     --------------------------------------------------------- */
  $$(".seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".seg-btn").forEach((x) => x.classList.toggle("is-on", x === b));
      range = +b.getAttribute("data-range");
      renderTrend();
      renderBars();
      renderGrid();
    }),
  );

  /* ---------------------------------------------------------
     14. Data: export / import / demo / wipe
     --------------------------------------------------------- */
  $("#exportBtn").addEventListener("click", () => {
    saveNow();
    const payload = JSON.stringify(
      {
        app: "paper-trail",
        schema: SCHEMA,
        exported: new Date().toISOString(),
        data: S,
      },
      null,
      2,
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "paper-trail-backup-" + TODAY() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    closePop();
    toast("backup downloaded — keep it somewhere safe ✦");
  });

  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result);
        const d = j && j.data ? j.data : j;
        if (!d || !Array.isArray(d.habits)) throw new Error("bad file");
        if (
          !confirm(
            "Restore this backup?\n\nIt will replace everything currently in the book (" +
              S.habits.length +
              " habits, " +
              Object.keys(S.entries).length +
              " days).",
          )
        ) {
          e.target.value = "";
          return;
        }
        S = {
          schema: SCHEMA,
          born: d.born || TODAY(),
          habits: d.habits.filter((h) => h && h.id && h.name),
          columns: (d.columns || []).filter((k) =>
            /^\d{4}-\d{2}-\d{2}$/.test(k),
          ),
          entries: d.entries && typeof d.entries === "object" ? d.entries : {},
        };
        S.habits.forEach((h, i) => {
          if (h.color == null) h.color = i;
          if (!h.emoji) h.emoji = "✦";
          if (!h.createdAt) h.createdAt = TODAY();
        });
        syncColumns();
        saveNow();
        closePop();
        doRender();
        toast("restored ✓ " + S.habits.length + " habits");
      } catch (err) {
        toast("That file is not a Paper Trail backup.");
      }
      e.target.value = "";
    };
    rd.readAsText(f);
  });

  $("#demoBtn").addEventListener("click", () => {
    if (
      !confirm(
        "Replace the book with the demo data?\n\nYour current habits and stamps will be replaced.",
      )
    )
      return;
    seed();
    closePop();
    doRender();
    toast("demo book loaded ✦");
  });

  $("#wipeBtn").addEventListener("click", () => {
    if (
      !confirm(
        "Erase every habit and every stamp?\n\nThis cannot be undone unless you have a backup.",
      )
    )
      return;
    if (
      !confirm(
        "Really? Last chance — download a backup first if you want to keep this.",
      )
    )
      return;
    S = blank();
    S.habits = [];
    S.columns = [];
    S.entries = {};
    localStorage.removeItem(KEY);
    syncColumns();
    save();
    closePop();
    doRender();
    toast("cleared — a blank page ✦");
  });

  /* ---------------------------------------------------------
     15. Cross-tab sync + resize
     --------------------------------------------------------- */
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    if (load()) {
      doRender();
      toast("updated from another tab");
    }
  });

  window.addEventListener("beforeunload", saveNow);

  // the trend chart's viewBox tracks its container, so redraw on resize
  let rzT = null;
  window.addEventListener("resize", () => {
    clearTimeout(rzT);
    rzT = setTimeout(() => {
      renderTrend();
    }, 160);
  });

  /* ---------------------------------------------------------
     16. Boot
     --------------------------------------------------------- */
  (function boot() {
    const had = load();
    if (!had) seed();
    syncColumns();
    doRender();
    setTimeout(() => {
      const s = $("#gridScroll");
      if (s) s.scrollLeft = s.scrollWidth; // start on "today"
    }, 60);

    // date rollover while the page stays open
    let lastDay = TODAY();
    setInterval(() => {
      const now = TODAY();
      if (now !== lastDay) {
        lastDay = now;
        syncColumns();
        doRender();
      }
    }, 60000);
  })();
})();
