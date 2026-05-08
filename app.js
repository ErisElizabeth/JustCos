/*
  Just Cos application logic.

  This file is intentionally heavily commented because the app is both a
  calculator and a learning project. The comments explain what each group of
  variables and functions is responsible for, plus the trig idea behind the
  math when that matters.
*/

/* EPS is a tiny tolerance used when comparing decimal math results. */
const EPS = 1e-7;

/* DEG keeps degree symbols consistent while the source code stays ASCII-safe. */
const DEG = "\u00b0";

/* sideKeys are the three triangle side names. Side a is opposite angle A. */
const sideKeys = ["a", "b", "c"];

/* angleKeys are the three triangle angle names, measured in degrees. */
const angleKeys = ["A", "B", "C"];

/* opposite lets the solver jump from an angle to its opposite side, or back. */
const opposite = { A: "a", B: "b", C: "c", a: "A", b: "B", c: "C" };

/* includedAngleForSides tells us the angle between any two known sides. */
const includedAngleForSides = { ab: "C", ac: "B", bc: "A" };

/* SVG_BOX defines the coordinate system used by the triangle drawing. */
const SVG_BOX = {
  width: 360,
  height: 280,
  pad: 50
};

/* LABEL sets the spacing rules for label hit boxes and callout arrows. */
const LABEL = {
  padX: 8,
  padY: 6,
  minWidth: 52,
  height: 26,
  gap: 8,
  pushStep: 9,
  maxPushes: 20,
  arrowThreshold: 10
};

/*
  els is a central map of important DOM elements.
  Keeping selectors here makes the rest of the code easier to read.
*/
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

/* currentSolutions stores the solved triangle or triangles currently displayed. */
let currentSolutions = [];

/* selectedSolution remembers which tab is active when SSA creates two triangles. */
let selectedSolution = 0;

/* activeDiagramKey stores the currently selected side or angle for touch/click. */
let activeDiagramKey = null;

/* Converts degrees to radians because JavaScript trig functions use radians. */
function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/* Converts radians back to degrees for values shown to learners. */
function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

/* Keeps a number inside a lower and upper bound. */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/* Formats a number without long decimal tails. */
function round(value, digits = 4) {
  if (!Number.isFinite(value)) return "undefined";
  return Number.parseFloat(value.toFixed(digits)).toString();
}

/* Reads one input box and returns null for empty, NaN for invalid, or a number. */
function parseValue(input) {
  const text = input.value.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : NaN;
}

/* Collects all six triangle inputs into one data object. */
function readTriangle() {
  const data = {};
  [...sideKeys, ...angleKeys].forEach((key) => {
    data[key] = parseValue(els.inputs[key]);
  });
  return data;
}

/* Returns only the keys that have usable values. */
function knownKeys(data, keys) {
  return keys.filter((key) => data[key] !== null && !Number.isNaN(data[key]));
}

/*
  Checks basic input rules before any trig formula runs.
  This catches impossible angle totals, negative sides, and non-numeric entries.
*/
function validateInputs(data) {
  for (const key of sideKeys) {
    if (Number.isNaN(data[key])) return problem(`Side ${key} is not a number.`, "Use plain numbers, like 7 or 12.5.");
    if (data[key] !== null && data[key] <= 0) return problem(`Side ${key} has to be bigger than 0.`, "A triangle side is a length, so zero or negative lengths cannot draw a real triangle.");
  }

  for (const key of angleKeys) {
    if (Number.isNaN(data[key])) return problem(`Angle ${key} is not a number.`, "Use degrees, like 45 or 62.5.");
    if (data[key] !== null && (data[key] <= 0 || data[key] >= 180)) {
      return problem(`Angle ${key} has to be between 0${DEG} and 180${DEG}.`, "A triangle corner has to open more than nothing, but less than a straight line.");
    }
  }

  const knownAngles = knownKeys(data, angleKeys);
  const angleSum = knownAngles.reduce((sum, key) => sum + data[key], 0);
  if (knownAngles.length === 3 && Math.abs(angleSum - 180) > 0.05) {
    return problem("Those three angles do not add to 180 degrees.", "Every triangle spends exactly 180 degrees across its three corners. If the angles miss that total, the corners cannot close into a triangle.");
  }
  if (knownAngles.length < 3 && angleSum >= 180) {
    return problem("The known angles already reach 180 degrees.", "There has to be room left for the missing corner. Once the known angles hit 180 degrees, the triangle is already flat.");
  }

  return null;
}

/* Builds a standard failure object for missing or impossible data. */
function problem(title, explanation) {
  return { ok: false, title, explanation, solutions: [], formulas: [] };
}

/* Builds a standard success object for solved triangles. */
function success(title, explanation, solutions, formulas) {
  return { ok: true, title, explanation, solutions, formulas };
}

/*
  Main solver router.
  It looks at which facts are known and chooses the formula family:
  AAS/ASA, SSS, SAS, or SSA.
*/
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

/*
  Solves ASA/AAS-style triangles.
  Two angles set the shape; one matching side-angle pair sets the size.
*/
function solveByAngles(data, sides, angles) {
  const solved = { ...data };
  const formulas = [];
  const angleSum = angles.reduce((sum, key) => sum + data[key], 0);

  if (angles.length === 2) {
    const missing = angleKeys.find((key) => solved[key] === null);
    solved[missing] = 180 - angleSum;
    formulas.push({
      formula: `${missing} = 180${DEG} - ${angles.join(" - ")}`,
      why: `All three triangle angles always add to 180${DEG}, so the missing angle is whatever is left.`
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
        why: "The Law of Sines says each side divided by the sine of its opposite angle shares the same ratio."
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

/*
  Solves SSS triangles.
  With all three sides known, the Law of Cosines finds each angle.
*/
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
        formula: "cos(A) = (b^2 + c^2 - a^2) / 2bc",
        why: "When all sides are known, the Law of Cosines turns side lengths into angles."
      },
      {
        formula: `A + B + C = 180${DEG}`,
        why: `After two angles are known, the last one is the remaining part of 180${DEG}.`
      }
    ]
  );
}

/* Decides whether two sides and one angle are SAS or SSA. */
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

/* Solves SAS by finding the missing side first, then finishing as SSS. */
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
        formula: `${missingSide}^2 = ${side1}^2 + ${side2}^2 - 2(${side1})(${side2})cos(${angleKey})`,
        why: "The Law of Cosines finds the side across from the known angle."
      }
    ]
  );
}

/*
  Solves SSA, the "ambiguous case."
  Sometimes the same facts create two valid triangles, so this function returns
  one or two solutions.
*/
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
      formula: `${remainingAngle} = 180${DEG} - ${angleKey} - ${otherAngle}`,
      why: `Once two angles are known, the last angle is what remains from 180${DEG}.`
    })
  );
}

/* Reuses the SSS solver after SAS has calculated the missing third side. */
function finishFromThreeSides(data, solved, title, explanation, formulas) {
  const result = solveSSS({ ...solved, A: data.A, B: data.B, C: data.C });
  if (!result.ok) return result;
  return success(title, explanation, result.solutions, formulas.concat(result.formulas));
}

/* Makes sure extra user-provided facts agree with the solved triangle. */
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

/* Renders either a problem explanation or solved triangle output. */
function renderResult(result) {
  els.tabs.innerHTML = "";
  currentSolutions = result.solutions || [];
  selectedSolution = 0;
  activeDiagramKey = null;

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

/* Switches between solution tabs and redraws the matching triangle. */
function selectSolution(index, result) {
  selectedSolution = index;
  activeDiagramKey = null;
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

/* Creates the six solved value cards below the drawing. */
function renderMetrics(solution) {
  return `
    <div class="solution-grid">
      ${sideKeys.map((side) => `<div class="metric"><span>Side ${side}</span><strong>${round(solution[side])}</strong></div>`).join("")}
      ${angleKeys.map((angle) => `<div class="metric"><span>Angle ${angle}</span><strong>${round(solution[angle])}${DEG}</strong></div>`).join("")}
    </div>
  `;
}

/* Updates the strip above the triangle drawing. */
function setStatus(text, type) {
  els.status.textContent = text;
  els.status.className = `status-strip ${type || ""}`.trim();
}

/*
  Draws a solved triangle.
  The math converts side lengths into screen points, then label layout prevents
  label boxes from touching.
*/
function renderTriangle(solution) {
  const { a, b, c, A, B, C } = solution;
  const rawX = (b * b + c * c - a * a) / (2 * c);
  const rawY = Math.sqrt(Math.max(0, b * b - rawX * rawX));
  const points = [
    { key: "A", x: 0, y: 0 },
    { key: "B", x: c, y: 0 },
    { key: "C", x: rawX, y: -rawY }
  ];
  const mapped = mapTrianglePoints(points);
  const centroid = averagePoint([mapped.A, mapped.B, mapped.C]);
  const labels = buildLabelLayout([
    sideLabelSpec("a", `a = ${round(a, 3)}`, mapped.B, mapped.C, centroid),
    sideLabelSpec("b", `b = ${round(b, 3)}`, mapped.A, mapped.C, centroid),
    sideLabelSpec("c", `c = ${round(c, 3)}`, mapped.A, mapped.B, centroid),
    angleLabelSpec("A", `A ${round(A, 2)}${DEG}`, mapped.A, centroid),
    angleLabelSpec("B", `B ${round(B, 2)}${DEG}`, mapped.B, centroid),
    angleLabelSpec("C", `C ${round(C, 2)}${DEG}`, mapped.C, centroid)
  ]);

  els.svg.innerHTML = `
    <polygon class="triangle-fill" points="${pointList([mapped.A, mapped.B, mapped.C])}"></polygon>
    ${sideLine("a", mapped.B, mapped.C)}
    ${sideLine("b", mapped.A, mapped.C)}
    ${sideLine("c", mapped.A, mapped.B)}
    ${vertexCircle("A", mapped.A)}
    ${vertexCircle("B", mapped.B)}
    ${vertexCircle("C", mapped.C)}
    ${labels.map(renderDiagramLabel).join("")}
  `;
  wireDiagramHighlights();
}

/* Scales raw geometry points into the fixed SVG coordinate system. */
function mapTrianglePoints(points) {
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const usableWidth = SVG_BOX.width - SVG_BOX.pad * 2;
  const usableHeight = SVG_BOX.height - SVG_BOX.pad * 2;
  const scale = Math.min(usableWidth / Math.max(maxX - minX, EPS), usableHeight / Math.max(maxY - minY, EPS));

  return Object.fromEntries(
    points.map((p) => [
      p.key,
      {
        x: SVG_BOX.pad + (p.x - minX) * scale,
        y: SVG_BOX.pad + (p.y - minY) * scale
      }
    ])
  );
}

/* Turns point objects into the x,y string expected by an SVG polygon. */
function pointList(points) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/* Draws a targetable side line. */
function sideLine(side, p1, p2) {
  return `<line class="triangle-side" data-diagram-target="side-${side}" x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"></line>`;
}

/* Draws a targetable vertex circle for an angle. */
function vertexCircle(angle, point) {
  return `<circle class="triangle-vertex" data-diagram-target="angle-${angle}" cx="${point.x}" cy="${point.y}" r="5"></circle>`;
}

/* Averages points to find the triangle center. */
function averagePoint(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

/* Creates a label spec for a side, anchored to the middle of that side. */
function sideLabelSpec(side, text, p1, p2, centroid) {
  const anchor = midpoint(p1, p2);
  const direction = unitVector(anchor.x - centroid.x, anchor.y - centroid.y);
  return {
    key: `side-${side}`,
    text,
    anchor,
    desired: {
      x: anchor.x + direction.x * 20,
      y: anchor.y + direction.y * 20
    },
    push: direction
  };
}

/* Creates a label spec for an angle, anchored to the triangle vertex. */
function angleLabelSpec(angle, text, point, centroid) {
  const direction = unitVector(point.x - centroid.x, point.y - centroid.y);
  return {
    key: `angle-${angle}`,
    text,
    anchor: point,
    desired: {
      x: point.x + direction.x * 28,
      y: point.y + direction.y * 28
    },
    push: direction
  };
}

/* Finds the point exactly halfway between two points. */
function midpoint(p1, p2) {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  };
}

/* Converts an x/y direction into a length-1 vector for steady label pushing. */
function unitVector(x, y) {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

/* Estimates label box width from text length, which SVG cannot measure before render. */
function estimateLabelWidth(text) {
  return Math.max(LABEL.minWidth, text.length * 7.6 + LABEL.padX * 2);
}

/* Creates a rectangle centered on a point. */
function rectFromCenter(center, width, height) {
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height
  };
}

/* Returns the center point of a rectangle. */
function rectCenter(rect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

/* Detects whether two label hit boxes touch or overlap. */
function rectsOverlap(a, b, gap = LABEL.gap) {
  return !(
    a.x + a.width + gap < b.x ||
    b.x + b.width + gap < a.x ||
    a.y + a.height + gap < b.y ||
    b.y + b.height + gap < a.y
  );
}

/* Keeps label hit boxes inside the SVG viewBox. */
function keepRectInBounds(rect) {
  const margin = 6;
  return {
    ...rect,
    x: clamp(rect.x, margin, SVG_BOX.width - rect.width - margin),
    y: clamp(rect.y, margin, SVG_BOX.height - rect.height - margin)
  };
}

/*
  Places label hit boxes one at a time.
  If a new label touches an existing hit box, it moves outward and gets a
  leader arrow back to the original triangle part.
*/
function buildLabelLayout(specs) {
  const placed = specs.map((spec) => {
    const width = estimateLabelWidth(spec.text);
    const rect = keepRectInBounds(rectFromCenter(spec.desired, width, LABEL.height));
    return {
      ...spec,
      rect,
      originalCenter: rectCenter(rect),
      wasPushed: false
    };
  });

  for (let cycle = 0; cycle < 80; cycle += 1) {
    let movedAnyLabel = false;
    for (let leftIndex = 0; leftIndex < placed.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < placed.length; rightIndex += 1) {
        if (separateOverlappingLabels(placed[leftIndex], placed[rightIndex])) {
          movedAnyLabel = true;
        }
      }
    }
    if (!movedAnyLabel) break;
  }

  return placed.map((label) => {
    const center = rectCenter(label.rect);
    const movedDistance = Math.hypot(center.x - label.originalCenter.x, center.y - label.originalCenter.y);
    return {
      ...label,
      center,
      showLeader: label.wasPushed || movedDistance > LABEL.arrowThreshold
    };
  });
}

/*
  Separates one overlapping pair of label boxes.
  It chooses the smaller overlap direction so labels move the least amount
  needed, then clamps them back inside the SVG.
*/
function separateOverlappingLabels(left, right) {
  if (!rectsOverlap(left.rect, right.rect)) return false;

  const leftCenter = rectCenter(left.rect);
  const rightCenter = rectCenter(right.rect);
  const overlapX = (left.rect.width + right.rect.width) / 2 + LABEL.gap - Math.abs(leftCenter.x - rightCenter.x);
  const overlapY = (left.rect.height + right.rect.height) / 2 + LABEL.gap - Math.abs(leftCenter.y - rightCenter.y);
  const moveOnX = overlapX <= overlapY || Math.abs(leftCenter.x - rightCenter.x) > Math.abs(leftCenter.y - rightCenter.y);
  const sign = moveOnX
    ? Math.sign(leftCenter.x - rightCenter.x) || Math.sign(left.push.x - right.push.x) || -1
    : Math.sign(leftCenter.y - rightCenter.y) || Math.sign(left.push.y - right.push.y) || -1;
  const amount = (moveOnX ? overlapX : overlapY) / 2 + 1;

  if (moveOnX) {
    left.rect = keepRectInBounds({ ...left.rect, x: left.rect.x + sign * amount });
    right.rect = keepRectInBounds({ ...right.rect, x: right.rect.x - sign * amount });
  } else {
    left.rect = keepRectInBounds({ ...left.rect, y: left.rect.y + sign * amount });
    right.rect = keepRectInBounds({ ...right.rect, y: right.rect.y - sign * amount });
  }

  left.wasPushed = true;
  right.wasPushed = true;
  return true;
}

/* Renders one interactive label group, including its optional leader arrow. */
function renderDiagramLabel(label) {
  const textY = label.center.y + 4.5;
  return `
    <g class="diagram-label" data-diagram-label="${label.key}" tabindex="0" role="button" aria-label="Highlight ${label.text}">
      ${label.showLeader ? leaderLine(label) : ""}
      <rect class="label-box" x="${label.rect.x}" y="${label.rect.y}" width="${label.rect.width}" height="${label.rect.height}"></rect>
      <text class="label-text" x="${label.center.x}" y="${textY}" text-anchor="middle">${label.text}</text>
    </g>
  `;
}

/* Draws an arrow-like leader from a moved label back to the side or angle. */
function leaderLine(label) {
  const edge = pointOnRectToward(label.rect, label.anchor);
  return `
    <line class="leader-line" x1="${edge.x}" y1="${edge.y}" x2="${label.anchor.x}" y2="${label.anchor.y}"></line>
    <circle class="leader-dot" cx="${label.anchor.x}" cy="${label.anchor.y}" r="2.5"></circle>
  `;
}

/* Finds the point on a label box closest to its triangle anchor. */
function pointOnRectToward(rect, target) {
  return {
    x: clamp(target.x, rect.x, rect.x + rect.width),
    y: clamp(target.y, rect.y, rect.y + rect.height)
  };
}

/* Adds hover, focus, click, and touch highlighting after the SVG is redrawn. */
function wireDiagramHighlights() {
  const labels = els.svg.querySelectorAll("[data-diagram-label]");
  labels.forEach((label) => {
    const key = label.dataset.diagramLabel;
    label.addEventListener("mouseenter", () => setDiagramHighlight(key, false));
    label.addEventListener("mouseleave", () => setDiagramHighlight(activeDiagramKey, false));
    label.addEventListener("focus", () => setDiagramHighlight(key, false));
    label.addEventListener("blur", () => setDiagramHighlight(activeDiagramKey, false));
    label.addEventListener("click", () => toggleDiagramHighlight(key));
    label.addEventListener("touchstart", (event) => {
      event.preventDefault();
      toggleDiagramHighlight(key);
    }, { passive: false });
    label.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleDiagramHighlight(key);
      }
    });
  });
}

/* Toggles a persistent highlight for click/tap interactions. */
function toggleDiagramHighlight(key) {
  activeDiagramKey = activeDiagramKey === key ? null : key;
  setDiagramHighlight(activeDiagramKey, true);
}

/* Applies highlight classes to the chosen label and its matching triangle element. */
function setDiagramHighlight(key) {
  els.svg.querySelectorAll(".is-highlighted").forEach((node) => {
    node.classList.remove("is-highlighted");
  });
  if (!key) return;

  const label = els.svg.querySelector(`[data-diagram-label="${key}"]`);
  const target = els.svg.querySelector(`[data-diagram-target="${key}"]`);
  if (label) label.classList.add("is-highlighted");
  if (target) target.classList.add("is-highlighted");
}

/* Draws the friendly starter triangle before there is a solved result. */
function renderEmptyTriangle() {
  activeDiagramKey = null;
  els.svg.innerHTML = `
    <path class="empty-figure" d="M62 220 L190 62 L306 220 Z"></path>
    <path class="triangle-guide" d="M190 62 L190 220"></path>
    <text class="svg-label" x="176" y="54">A</text>
    <text class="svg-label" x="42" y="238">B</text>
    <text class="svg-label" x="306" y="238">C</text>
    <text class="svg-small" x="180" y="250" text-anchor="middle">a, b, c live across from A, B, C</text>
  `;
}

/* Clears all triangle inputs and restores the starter explanation. */
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

/* Fills an SSA example because it demonstrates two possible triangles. */
function fillExample() {
  clearTriangle();
  els.inputs.a.value = "7";
  els.inputs.b.value = "10";
  els.inputs.A.value = "35";
  renderResult(solveTriangle(readTriangle()));
}

/* Solves one trig lookup value outside the full triangle workflow. */
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
    : `${fn}(${round(angle, 4)}${DEG}) = ${readable}`;
  els.lookupResult.textContent = reason;
}

/* Loads saved theme preference and updates the small toggle label. */
function initTheme() {
  const saved = localStorage.getItem("just-cos-theme");
  if (saved) document.documentElement.dataset.theme = saved;
  els.theme.querySelector("span").textContent = document.documentElement.dataset.theme === "light" ? "LM" : "DM";
}

/* Handles the triangle form submission. */
els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderResult(solveTriangle(readTriangle()));
});

/* Connects the triangle utility buttons. */
els.clear.addEventListener("click", clearTriangle);
els.example.addEventListener("click", fillExample);

/* Connects the standalone trig lookup form. */
els.lookupForm.addEventListener("submit", lookupTrig);

/* Toggles between dark and light mode and saves that choice. */
els.theme.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("just-cos-theme", next);
  els.theme.querySelector("span").textContent = next === "light" ? "LM" : "DM";
});

/* Starts the app in the saved theme and shows the starter triangle. */
initTheme();
renderEmptyTriangle();
