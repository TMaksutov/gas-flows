/* script_engine.js
 * Scenario scripting engine v0.2 for GasPipelines
 * -------------------------------------------------
 * Allows sequential scenario scripts in the form
 *   condition , action
 * Examples:
 *   14:20, n0.injection = 5
 *   n1.pressure > 10, n1_n3.disable = true
 *
 * - Supports absolute time MM:SS or HH:MM:SS (assuming simulated clock starts at 00:00)
 * - Supports numeric comparisons on any node/edge data property
 * - Executes one rule at a time (FIFO). When a rule's condition becomes true,
 *   its action is executed, the line is painted green, and the engine begins
 *   watching the next rule.
 * - Lines that fail to parse or reference unknown elements turn red.
 * - Exposes global evaluateScripts(simulatedSeconds) to be called once per tick.
 * ------------------------------------------------- */
(function (global) {
  'use strict';

  const textareaId = 'scriptInput';
  const statusId   = 'scriptStatus';

  /** internal state */
  let rules = [];

  /** tiny helpers */
  function $(id) { return document.getElementById(id); }
  const textarea  = $(textareaId);
  const statusBox = $(statusId);

  if (!textarea) {
    console.warn('script_engine: textarea #' + textareaId + ' not found');
    return;
  }

  /** debounce util */
  function debounce(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /** re‑parse script when user edits */
  textarea.addEventListener('input', debounce(loadScript, 300));
  loadScript(); // initial

  /** ------ parsing ------------------------------------------------------- */
  function loadScript() {
    const lines = textarea.value.split(/\n+/).map(l => l.trim()).filter(Boolean);
    rules = lines.map(parseLine);
    renderStatuses();
  }

  function parseLine(line) {
    const rule = { raw: line, executed: false, error: false };
    try {
      const parts = line.split(',');
      if (parts.length !== 2) throw new Error('Missing comma');
      rule.condition = parseCondition(parts[0].trim());
      rule.action    = parseAction(parts[1].trim());
    } catch (e) {
      rule.error = true;
    }
    return rule;
  }

  function parseCondition(str) {
    /* time HH:MM[:SS]  or  MM:SS */
	const t = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
	if (t) {
	  const h = +t[1], m = +t[2], s = +t[3];
	  return { type: 'time', value: h * 3600 + m * 60 + s };
	}

    /* comparison id.prop op value */
    const cmp = str.match(/^([\w\d_]+(?:_[\w\d_]+)?)\.(\w+)\s*(>=|<=|==|>|<)\s*([\d.]+)$/);
    if (cmp) {
      return {
        type: 'cmp',
        id: cmp[1],
        prop: cmp[2],
        op: cmp[3],
        value: parseFloat(cmp[4])
      };
    }
    throw new Error('Unknown condition syntax');
  }

  function parseAction(str) {
    const a = str.match(/^([\w\d_]+(?:_[\w\d_]+)?)\.(\w+)\s*=\s*([\w\d.]+)$/);
    if (!a) throw new Error('Bad action syntax');
    return { id: a[1], prop: a[2], value: toValue(a[3]) };
  }

  function toValue(v) {
    if (v === 'true')  return true;
    if (v === 'false') return false;
    const num = Number(v);
    return isNaN(num) ? v : num;
  }

  /** ------ execution ----------------------------------------------------- */
  function evaluateScripts(simSec) {
    if (!rules.length) return;
    const next = rules.find(r => !r.executed && !r.error);
    if (!next) return;

    try {
      if (conditionTrue(next.condition, simSec)) {
        performAction(next.action);
        next.executed = true;
        renderStatuses();
      }
    } catch (e) {
      next.error = true;
      renderStatuses();
    }
  }

  function conditionTrue(cond, simSec) {
    if (cond.type === 'time') return simSec >= cond.value;
    if (cond.type === 'cmp') {
      const el = getElement(cond.id);
      const val = dataOf(el, cond.prop);
      return compare(val, cond.op, cond.value);
    }
    return false;
  }

  function performAction(act) {
    const el = getElement(act.id);
    setData(el, act.prop, act.value);
  }

  /** ------ cytoscape helpers -------------------------------------------- */
  function getElement(id) {
    if (typeof cy === 'undefined') throw new Error('cy undefined');
    const els = cy.$('#' + id);
    if (!els.length) throw new Error('Element ' + id + ' not found');
    return els;
  }
  function dataOf(el, prop) { return el.data(prop); }
function setData(el, prop, v) {
  el.data(prop, v);
  if (typeof updateInfo === 'function') updateInfo();
}


  function compare(a, op, b) {
    switch (op) {
      case '>':  return a >  b;
      case '<':  return a <  b;
      case '>=': return a >= b;
      case '<=': return a <= b;
      case '==': return a == b;
    }
  }

  /** ------ UI ------------------------------------------------------------ */
  function renderStatuses() {
    if (!statusBox) return;
    statusBox.innerHTML = '';
    rules.forEach(r => {
      const div = document.createElement('div');
      div.textContent = r.raw;
      if (r.error)         div.style.color = 'red';
      else if (r.executed) div.style.color = 'green';
      statusBox.appendChild(div);
    });
  }

  /** expose public functions */
  global.evaluateScripts = evaluateScripts;

  global.resetScriptEngine = function() {
    rules.forEach(r => {
      r.executed = false;
      r.error = false;
    });
    renderStatuses();
  };

  // --- LocalStorage persistence -----------------------------------------
  const savedScript = localStorage.getItem('scriptText');
  if (savedScript) textarea.value = savedScript;

  textarea.addEventListener('input', debounce(() => {
    localStorage.setItem('scriptText', textarea.value);
    loadScript();
  }, 300));

  loadScript(); // initial load
})(window);
