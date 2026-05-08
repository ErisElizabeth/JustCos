const EPS = 1e-7;
const sideKeys = ["a", "b", "c"];
const angleKeys = ["A", "B", "C"];
const opposite = { A: "a", B: "b", C: "c", a: "A", b: "B", c: "C" };
const includedAngleForSides = { ab: "C", ac: "B", bc: "A" };
const sidePairForAngle = { A: ["b", "c"], B: ["a", "c"], C: ["a", "b"] };

const els = {
  form: document.querySelector("#triangleForm"),
  status: document.querySelector("#statusStrip"),
  svg: document.querySelector("#triangleSvg"),
  result: document.querySelector("#resultPanel"),
  tabs: document.querySelector("#solutionTabs"),
  clear: document.querySelector("#clearTriangle"),
  example: document.querySelector("#fillExample"),
  theme: document.querySelector("#themeToggle"),
  lookupForm: document.querySelector("#lookupForm"),
  lookupFn: document.querySelector("#lookupFn"),
  lookupAngle: document.querySelector("#lookupAngle"),
  lookupResult: document.querySelector("#lookupResult"),
  inputs: {
    a: document.querySelector("#sideA"),
    b: document.querySelector("#sideB"),
    c: document.querySelector("#sideC"),
    A: document.querySelector("#angleA"),
    B: document.querySelector("#angleB"),
    C: document.querySelector("#angleC")
  }
};

let currentSolutions = [];
let selectedSolution = 0;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return "undefined";
  return Number.parseFloat(value.toFixed(digits)).toString();
}

function parseValue(input) {
  const text = input.value.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

function readTriangle() {
  const data = {};
  [...sideKeys, ...angleKeys].forEach((key) => {
    data[key] = parseValue(els.inputs[key]);
  });
  return data;
}

function knownKeys(data, keys) {
  return keys.filter((key) => data[key] !== null && !Number.isNaN(data[key]));
}

function validateInputs(data) {
  for (const key of sideKeys) {
    if (Number.isNaN(data[key])) return problem(`Side ${key} is not a number.`, "Use plain numbers, like 7 or 12.5.");
    if (data[key] !== null && data[key] <= 0) return problem(`Side ${key} has to be bigger than 0.`, "A triangle side is a length, so zero or negative lengths cannot draw a real triangle.");
  }

  for (const key of angleKeys) {
    if (Number.isNaN(data[key])) return problem(`Angle ${key} is not a number.`, "Use degrees, like 45 or 62.5.");
    if (data[key] !== null && (data[key] <= 0 || data[key] >= 180)) {
      return problem(`Angle ${key} has to be between 0° and 180°.`, "A triangle corner has to open more than nothing, but less than a straight line.");
    }
  }

  const knownAngles = knownKeys(data, angleKeys);
  const angleSum = knownAngles.reduce((sum, key) => sum + data[key], 0);
  if (knownAngles.length === 3 && Math.abs(angleSum - 180) > 0.05) {
    return problem("Those three angles do not add to 180°.", "Every triangle spends exactly 180° across its three corners. If the angles miss that total, the corners cannot close into a triangle.");
  }
  if (knownAngles.length < 3 && angleSum >= 180) {
    return problem("The known angles already reach 180°.", "There has to be room left for the missing corner. Once the known angles hit 180°, the triangle is already flat.");
  }

  return null;
}

function problem(title, explanation) {
  return { ok: false, title, explanation, solutions: [], formulas: [] };
}

function success(title, explanation, solutions, formulas) {
  return { ok: true, title, explanation, solutions, formulas };
}

function solveTriangle(data) {
  const invalid = validateInputs(data);
  if (invalid) return invalid;

  const sides = knownKeys(data, sideKeys);
  const angles = knownKeys(data, angleKeys);
  const facts = sides.length + angles.length;

  if (facts < 3) {
    return problem(
      "One more fact is needed.",
      "A triangle usually needs three useful facts before it is pinned down. At least one of those facts must be a side, because angles alone only tell the shape, not the size."
    );
  }

  if (sides.length === 0) {
    return problem(
      "A side length is needed.",
      "Three angles can make many look-alike triangles: tiny ones, huge ones, and everything between. One side tells the calculator the actual scale."
    );
  }

  if (angles.length >= 2) return solveByAngles(data, sides, angles);
  if (sides.length === 3) return solveSSS(data);
  if (sides.length === 2 && angles.length >= 1) return solveTwoSidesAngle(data, sides, angles);

  return problem(
    "The facts do not lock the triangle yet.",
    "Right now the triangle can still wiggle into many different shapes. Add another side or an angle that connects to the side you already know."
  );
}

function solveByAngles(data, sides, angles) {
  const solved = { ...data };
  const formulas = [];
  const angleSum = angles.reduce((sum, key) => sum + data[key], 0);

  if (angles.length === 2) {
    const missing = angleKeys.find((key) => solved[key] === null);
    solved[missing] = 180 - angleSum;
    formulas.push({
      formula: `${missing} = 180° - ${angles.join(" - ")}`,
      why: "All three triangle angles always add to 180°, so the missing angle is whatever is left."
    });
  }

  const referenceSide = sides.find((side) => solved[opposite[side]] !== null);
  if (!referenceSide) {
    return problem("A matching side-angle pair is needed.", "The Law of Sines needs one side and its opposite angle as the starting pair.");
  }

  const refAngle = opposite[referenceSide];
  const ratio = solved[referenceSide] / Math.sin(toRad(solved[refAngle]));
  for (const side of sideKeys) {
    const angle = opposite[side];
    const expected = ratio * Math.sin(toRad(solved[angle]));
    if (solved[side] === null) {
      solved[side] = expected;
      formulas.push({
        formula: `${side} / sin(${angle}) = ${referenceSide} / sin(${refAngle})`,
        why: `The Law of Sines says each side divided by the sine of its opposite angle shares the same ratio.`
      });
    } else if (side !== referenceSide && Math.abs(solved[side] - expected) > Math.max(0.04, expected * 0.005)) {
      return problem(
        `Side ${side} does not match the angles.`,
        "With these angles, the side lengths need to grow in the same pattern as their opposite sines. This side breaks that pattern, so one input is probably off."
      );
    }
  }

  const consistency = validateKnownFacts(data, solved);
  if (consistency) return consistency;

  return success(
    "Solved with the Law of Sines.",
    "Two angles fixed the shape, and one side fixed the size.",
    [solved],
    formulas
  );
}

function solveSSS(data) {
  const { a, b, c } = data;
  if (a + b <= c + EPS || a + c <= b + EPS || b + c <= a + EPS) {
    return problem(
      "Those sides cannot make a triangle.",
      "The two shorter sides have to be long enough to meet each other. Here, they fall short or only make a flat line."
    );
  }

  const solved = { ...data };
  solved.A = toDeg(Math.acos(clamp((b * b + c * c - a * a) / (2 * b * c), -1, 1)));
  solved.B = toDeg(Math.acos(clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1)));
  solved.C = 180 - solved.A - solved.B;

  const consistency = validateKnownFacts(data, solved);
  if (consistency) return consistency;

  return success(
    "Solved with the Law of Cosines.",
    "Three side lengths fix exactly one triangle.",
    [solved],
    [
      {
        formula: "cos(A) = (b² + c² - a²) / 2bc",
        why: "When all sides are known, the Law of Cosines turns side lengths into angles."
      },
      {
        formula: "A + B + C = 180°",
        why: "After two angles are known, the last one is the remaining part of 180°."
      }
    ]
  );
}

function solveTwoSidesAngle(data, sides, angles) {
  const sidePairKey = sides.slice().sort().join("");
  const included = includedAngleForSides[sidePairKey];
  const knownIncluded = angles.find((angle) => angle === included);

  if (knownIncluded) return solveSAS(data, sides, knownIncluded);

  const ssaAngle = angles.find((angle) => sides.includes(opposite[angle]));
  if (ssaAngle) return solveSSA(data, sides, ssaAngle);

  return problem(
    "This angle does not connect enough pieces yet.",
    "With two sides, an angle is most useful when it sits between them, or when it is opposite one of them. Add that kind of angle, or add the third side."
  );
}

function solveSAS(data, sides, angleKey) {
  const solved = { ...data };
  const missingSide = sideKeys.find((side) => solved[side] === null);
  const [side1, side2] = sides;
  const knownAngle = solved[angleKey];

  solved[missingSide] = Math.sqrt(
    solved[side1] ** 2 + solved[side2] ** 2 - 2 * solved[side1] * solved[side2] * Math.cos(toRad(knownAngle))
  );

  return finishFromThreeSides(
    data,
    solved,
    "Solved with side-angle-side.",
    "Two sides and the angle between them make a triangle that cannot swing open another way.",
    [
      {
        formula: `${missingSide}² = ${side1}² + ${side2}² - 2(${side1})(${side2})cos(${angleKey})`,
        why: "The Law of Cosines finds the side across from the known angle."
      }
    ]
  );
}

function solveSSA(data, sides, angleKey) {
  const solvedBase = { ...data };
  const knownOppositeSide = opposite[angleKey];
  const otherSide = sides.find((side) => side !== knownOppositeSide);
  const otherAngle = opposite[otherSide];
  const remainingAngle = angleKeys.find((angle) => angle !== angleKey && angle !== otherAngle);
  const remainingSide = opposite[remainingAngle];
  const sinOther = (solvedBase[otherSide] * Math.sin(toRad(solvedBase[angleKey]))) / solvedBase[knownOppositeSide];
  const formulas = [
    {
      formula: `sin(${otherAngle}) / ${otherSide} = sin(${angleKey}) / ${knownOppositeSide}`,
      why: "The Law of Sines checks what the second known side does to the angle across from it."
    }
  ];

  if (sinOther > 1 + EPS) {
    return problem(
      "No triangle can reach that far.",
      "The known side across from the known angle is too short compared with the other side. The triangle would need the sine of an angle to be bigger than 1, and sine never goes past 1."
    );
  }

  const possible = [toDeg(Math.asin(clamp(sinOther, -1, 1)))];
  const supplement = 180 - possible[0];
  if (Math.abs(supplement - possible[0]) > 0.05) possible.push(supplement);

  const solutions = possible
    .map((angleValue) => {
      const candidate = { ...solvedBase };
      candidate[otherAngle] = angleValue;
      candidate[remainingAngle] = 180 - candidate[angleKey] - candidate[otherAngle];
      if (candidate[remainingAngle] <= EPS) return null;
      candidate[remainingSide] =
        (candidate[knownOppositeSide] * Math.sin(toRad(candidate[remainingAngle]))) /
        Math.sin(toRad(candidate[angleKey]));
      return candidate;
    })
    .filter(Boolean);

  if (!solutions.length) {
    return problem(
      "The angles would overfill the triangle.",
      "One possible angle is too large once the known angle is included. Together they leave no room for the third corner."
    );
  }

  return success(
    solutions.length === 2 ? "Two triangles are possible." : "Solved with the Law of Sines.",
    solutions.length === 2
      ? "This is the SSA case. The same facts can swing into two different triangles, so both are shown."
      : "The known angle and its opposite side gave one triangle.",
    solutions,
    formulas.concat({
      formula: `${remainingAngle} = 180° - ${angleKey} - ${otherAngle}`,
      why: "Once two angles are known, the last angle is what remains from 180°."
    })
  );
}

function finishFromThreeSides(data, solved, title, explanation, formulas) {
  const result = solveSSS({ ...solved, A: data.A, B: data.B, C: data.C });
  if (!result.ok) return result;
  return success(title, explanation, result.solutions, formulas.concat(result.formulas));
}

function validateKnownFacts(original, solved) {
  for (const side of sideKeys) {
    if (original[side] !== null && Math.abs(original[side] - solved[side]) > Math.max(0.04, solved[side] * 0.005)) {
      return problem(
        `Side ${side} does not match the other facts.`,
        "The calculator can solve a triangle from the other information, but that side length lands somewhere else. One of the inputs is probably copied wrong."
      );
    }
  }
  for (const angle of angleKeys) {
    if (original[angle] !== null && Math.abs(original[angle] - solved[angle]) > 0.08) {
      return problem(
        `Angle ${angle} does not match the other facts.`,
        "The other facts create a triangle, but this angle is not the angle that triangle would have."
      );
    }
  }
  return null;
}

function renderResult(result) {
  els.tabs.innerHTML = "";
  currentSolutions = result.solutions || [];
  selectedSolution = 0;

  if (!result.ok) {
    setStatus(result.title, "bad");
    renderEmptyTriangle();
    els.result.innerHTML = `
      <h2>${result.title}</h2>
      <p>${result.explanation}</p>
    `;
    return;
  }

  setStatus(result.title, currentSolutions.length > 1 ? "warn" : "good");
  currentSolutions.forEach((_, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tab-button${index === 0 ? " active" : ""}`;
    button.textContent = currentSolutions.length === 1 ? "Solution" : `Solution ${index + 1}`;
    button.addEventListener("click", () => selectSolution(index, result));
    els.tabs.appendChild(button);
  });
  selectSolution(0, result);
}

function selectSolution(index, result) {
  selectedSolution = index;
  els.tabs.querySelectorAll(".tab-button").forEach((button, buttonIndex) => {
    button.classList.toggle("active", buttonIndex === index);
  });
  const solution = currentSolutions[index];
  renderTriangle(solution);
  els.result.innerHTML = `
    <h2>${result.title}</h2>
    <p>${result.explanation}</p>
    ${renderMetrics(solution)}
    <h3>Formula Path</h3>
    <ul class="formula-list">
      ${result.formulas.map((item) => `<li><span class="formula">${item.formula}</span><span class="why">${item.why}</span></li>`).join("")}
    </ul>
  `;
}

function renderMetrics(solution) {
  return `
    <div class="solution-grid">
      ${sideKeys.map((side) => `<div class="metric"><span>Side ${side}</span><strong>${round(solution[side])}</strong></div>`).join("")}
      ${angleKeys.map((angle) => `<div class="metric"><span>Angle ${angle}</span><strong>${round(solution[angle])}°</strong></div>`).join("")}
    </div>
  `;
}

function setStatus(text, type) {
  els.status.textContent = text;
  els.status.className = `status-strip ${type || ""}`.trim();
}

function renderTriangle(solution) {
  const { a, b, c, A, B, C } = solution;
  const rawX = (b * b + c * c - a * a) / (2 * c);
  const rawY = Math.sqrt(Math.max(0, b * b - rawX * rawX));
  const points = [
    { key: "A", x: 0, y: 0 },
    { key: "B", x: c, y: 0 },
    { key: "C", x: rawX, y: -rawY }
  ];
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const pad = 44;
  const scale = Math.min((360 - pad * 2) / Math.max(maxX - minX, EPS), (280 - pad * 2) / Math.max(maxY - minY, EPS));
  const mapped = Object.fromEntries(
    points.map((p) => [
      p.key,
      {
        x: pad + (p.x - minX) * scale,
        y: pad + (p.y - minY) * scale
      }
    ])
  );

  els.svg.innerHTML = `
    <polygon class="triangle-edge" points="${mapped.A.x},${mapped.A.y} ${mapped.B.x},${mapped.B.y} ${mapped.C.x},${mapped.C.y}"></polygon>
    ${lineLabel(mapped.B, mapped.C, `a = ${round(a, 3)}`)}
    ${lineLabel(mapped.A, mapped.C, `b = ${round(b, 3)}`)}
    ${lineLabel(mapped.A, mapped.B, `c = ${round(c, 3)}`)}
    ${pointLabel(mapped.A, `A ${round(A, 2)}°`, 8, 26, "start")}
    ${pointLabel(mapped.B, `B ${round(B, 2)}°`, -8, 26, "end")}
    ${pointLabel(mapped.C, `C ${round(C, 2)}°`, 0, -18, "middle")}
  `;
}

function lineLabel(p1, p2, text) {
  const x = (p1.x + p2.x) / 2;
  const y = (p1.y + p2.y) / 2;
  return `<text class="svg-small" x="${x}" y="${y - 8}" text-anchor="middle">${text}</text>`;
}

function pointLabel(point, text, dx, dy, anchor) {
  const x = clamp(point.x + dx, 16, 344);
  const y = clamp(point.y + dy, 24, 262);
  return `<circle cx="${point.x}" cy="${point.y}" r="4" fill="currentColor"></circle><text class="svg-label" x="${x}" y="${y}" text-anchor="${anchor}">${text}</text>`;
}

function renderEmptyTriangle() {
  els.svg.innerHTML = `
    <path class="empty-figure" d="M62 220 L190 62 L306 220 Z"></path>
    <path class="triangle-guide" d="M190 62 L190 220"></path>
    <text class="svg-label" x="176" y="54">A</text>
    <text class="svg-label" x="42" y="238">B</text>
    <text class="svg-label" x="306" y="238">C</text>
    <text class="svg-small" x="180" y="250" text-anchor="middle">a, b, c live across from A, B, C</text>
  `;
}

function clearTriangle() {
  Object.values(els.inputs).forEach((input) => {
    input.value = "";
  });
  els.tabs.innerHTML = "";
  setStatus("Enter at least three useful facts, including one side.");
  renderEmptyTriangle();
  els.result.innerHTML = `
    <h2>Ready when you are.</h2>
    <p>Add sides and angles above. Just Cos will explain what is missing, what formula fits, and why the triangle can or cannot exist.</p>
  `;
}

function fillExample() {
  clearTriangle();
  els.inputs.a.value = "7";
  els.inputs.b.value = "10";
  els.inputs.A.value = "35";
  renderResult(solveTriangle(readTriangle()));
}

function lookupTrig(event) {
  event.preventDefault();
  const angle = Number(els.lookupAngle.value.trim());
  const fn = els.lookupFn.value;
  if (!Number.isFinite(angle)) {
    els.lookupResult.textContent = "Enter an angle in degrees first.";
    return;
  }
  const rad = toRad(angle);
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const tan = Math.tan(rad);
  const nearZero = (value) => Math.abs(value) < 1e-10;
  const values = {
    sin,
    cos,
    tan: nearZero(cos) ? null : tan,
    sec: nearZero(cos) ? null : 1 / cos,
    csc: nearZero(sin) ? null : 1 / sin,
    cot: nearZero(sin) ? null : cos / sin
  };
  const value = values[fn];
  const readable = value === null ? "undefined" : round(value, 6);
  const reason = value === null
    ? `${fn} is undefined here because it would require division by zero.`
    : `${fn}(${round(angle, 4)}°) = ${readable}`;
  els.lookupResult.textContent = reason;
}

function initTheme() {
  const saved = localStorage.getItem("just-cos-theme");
  if (saved) document.documentElement.dataset.theme = saved;
  els.theme.querySelector("span").textContent = document.documentElement.dataset.theme === "light" ? "☀" : "☾";
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderResult(solveTriangle(readTriangle()));
});
els.clear.addEventListener("click", clearTriangle);
els.example.addEventListener("click", fillExample);
els.lookupForm.addEventListener("submit", lookupTrig);
els.theme.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("just-cos-theme", next);
  els.theme.querySelector("span").textContent = next === "light" ? "☀" : "☾";
});

initTheme();
renderEmptyTriangle();
