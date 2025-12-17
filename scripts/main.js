// =============================================================================
// Configuration
// =============================================================================

const CONFIG = Object.freeze({
  DB_PATH: '/data/demo.sqlite',
  DEMO_ASSET_PATH: './assets/demo.sqlite',
  WHEEL_URL: './wheels/eqlize-0.1.0-py3-none-any.whl',
  PYODIDE_INDEX_URL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
  INIT_DELAY_MS: 50,
  SUCCESS_DISPLAY_MS: 500,
});

const INIT_STEPS = Object.freeze([
  'Load Pyodide runtime',
  'Load packages (micropip, sqlite3)',
  'Install wheel',
  'Load demo DB',
  'Prepare runner',
]);

const createPythonRunnerCode = (dbPath) => `
import json, sqlite3

from typing import Optional
from eqlize.adaptors import SQLiteAdaptor, SQLiteDialect
from eqlize.parser import EdgeQLParser
from eqlize.core import SQLCompiler
from eqlize.output import JSONFormatter
from eqlize.schema import Schema
from pyparsing import ParseException

formatter = JSONFormatter()
parser = EdgeQLParser()
sql_dialect = SQLiteDialect()
db_adaptor = None
compiler = None

def load_db(path: str) -> str:
    global db_adaptor, schema, compiler
    db_adaptor = SQLiteAdaptor(path)
    db_adaptor.connect()
    schema = db_adaptor.introspect_schema()
    compiler = SQLCompiler(schema, sql_dialect)
    return json.dumps(schema.to_dict(), indent=2)

def run_edgeql(edgeql_text: str) -> str:
    try:
        ast = parser.parse(edgeql_text)
        sql = compiler.compile(ast)
        print(sql)
        results = db_adaptor.execute_query(sql)
        structured_results = compiler.restructure_results(results)
        output = formatter.to_dict(structured_results)
        rows = output
        cols = set()
        for row in rows:
            cols.update(row.keys())
        cols = list(cols)
    except Exception as e:
        sql = ""
        rows = []
        cols = []
        output = {"error": str(e)}

    return json.dumps({"sql": sql, "cols": cols, "rows": rows, "output": output}, default=str)
`;

// =============================================================================
// DOM Utilities
// =============================================================================

const $ = (id) => document.querySelector(id);

const elements = {
  overlay: () => $('#initStatus'),
  overlayLog: () => $('#overlayLog'),
  overlayClose: () => $('#overlayClose'),
  btnRun: () => $('#btnRun'),
  query: () => $('#query'),
  dbPathLabel: () => $('#dbPathLabel'),
  spinner: () => $('#spinner'),
  statusMsg: () => $('#statusMsg'),
  stepsList: () => $('#stepsList'),
  schemaOut: () => $('#schemaOut'),
  results: () => $('#results'),
  jsonOut: () => $('#jsonOut'),
  sqlOut: () => $('#sqlOut'),
  tabTable: () => $('#tabTable'),
  tabJson: () => $('#tabJson'),
  panelTable: () => $('#panelTable'),
  panelJson: () => $('#panelJson'),
};

const createElement = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else if (key === 'className') {
      el.className = value;
    } else if (key === 'textContent') {
      el.textContent = value;
    } else {
      el.setAttribute(key, value);
    }
  });
  
  children.forEach(child => {
    if (child == null) return;
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  
  return el;
};

const clearElement = (el) => {
  el.innerHTML = '';
};

// =============================================================================
// State Management
// =============================================================================

const createStore = (initialState) => {
  let state = initialState;
  return {
    get: () => state,
    set: (value) => { state = value; },
  };
};

const pyodideStore = createStore(null);

// =============================================================================
// Icons
// =============================================================================

const icons = {
  pending: () => `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#bbb" stroke-width="2">
      <circle cx="12" cy="12" r="9"></circle>
    </svg>`,
  
  done: () => `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#0b8f3a" stroke-width="2">
      <circle cx="12" cy="12" r="9" stroke="#0b8f3a" fill="#eaf7ea"></circle>
      <path d="M9 12.5l1.8 1.8L15 11" stroke="#0b8f3a" stroke-width="2" fill="none" 
            stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>`,
};

// =============================================================================
// Overlay & Progress UI
// =============================================================================

const overlayUI = {
  show: (visible) => {
    const display = visible ? 'flex' : 'none';
    elements.spinner().style.display = visible ? 'block' : 'none';
    elements.overlay().style.display = display;
    elements.overlay().setAttribute('aria-hidden', String(!visible));
  },

  setStatus: (message) => {
    elements.statusMsg().textContent = message;
  },

  appendLog: (message) => {
    const log = elements.overlayLog();
    log.appendChild(createElement('div', { textContent: String(message) }));
    log.scrollTop = log.scrollHeight;
  },

  renderSteps: (steps) => {
    const list = elements.stepsList();
    clearElement(list);
    
    steps.forEach((text, index) => {
      const icon = createElement('span', { className: 'step-icon' });
      icon.innerHTML = icons.pending();
      
      const row = createElement('div', { className: 'step-item', 'data-step-index': index }, [
        icon,
        createElement('div', { className: 'step-text', textContent: text }),
      ]);
      
      list.appendChild(row);
    });
  },

  markStepDone: (index) => {
    const row = elements.stepsList().querySelector(`[data-step-index='${index}']`);
    if (!row) return;
    
    row.classList.add('step-done');
    row.querySelector('.step-icon').innerHTML = icons.done();
  },
};

// =============================================================================
// Tab Management
// =============================================================================

const setActiveTab = (tabId) => {
  const isJson = tabId === 'json';
  
  elements.tabTable()?.setAttribute('aria-pressed', String(!isJson));
  elements.tabJson()?.setAttribute('aria-pressed', String(isJson));
  
  const panelTable = elements.panelTable();
  const panelJson = elements.panelJson();
  
  if (panelTable) {
    panelTable.style.display = isJson ? 'none' : 'block';
    panelTable.setAttribute('aria-hidden', String(isJson));
  }
  
  if (panelJson) {
    panelJson.style.display = isJson ? 'block' : 'none';
    panelJson.setAttribute('aria-hidden', String(!isJson));
  }
};

// =============================================================================
// Value Rendering (Recursive)
// =============================================================================

const tableStyles = {
  table: { borderCollapse: 'collapse', width: '100%', margin: '6px 0' },
  th: { border: '1px solid #ddd', padding: '6px', textAlign: 'left' },
  td: { border: '1px solid #eee', padding: '6px' },
};

const createCollapsible = (summaryText, content) => 
  createElement('details', {}, [
    createElement('summary', { style: { cursor: 'pointer' }, textContent: summaryText }),
    content,
  ]);

const createTableHeader = (columns) =>
  createElement('thead', {}, [
    createElement('tr', {}, columns.map(col => 
      createElement('th', { style: tableStyles.th, textContent: col })
    )),
  ]);

const createTableCell = (content) => {
  const td = createElement('td', { style: tableStyles.td });
  td.appendChild(content);
  return td;
};

const renderEmptyArray = () => createCollapsible('Array[0]', document.createTextNode('[]'));

const renderObjectArray = (arr) => {
  const keys = [...new Set(arr.flatMap(item => Object.keys(item || {})))];
  
  const tbody = createElement('tbody', {},
    arr.map(item => createElement('tr', {},
      keys.map(key => createTableCell(createValueNode(item?.[key])))
    ))
  );
  
  const table = createElement('table', { style: tableStyles.table }, [
    createTableHeader(keys),
    tbody,
  ]);
  
  return createCollapsible(`Array[${arr.length}]`, table);
};

const renderPrimitiveArray = (arr) => {
  const tbody = createElement('tbody', {},
    arr.map(item => createElement('tr', {}, [createTableCell(createValueNode(item))]))
  );
  
  const table = createElement('table', { style: tableStyles.table }, [tbody]);
  return createCollapsible(`Array[${arr.length}]`, table);
};

const renderArrayValue = (arr) => {
  if (arr.length === 0) return renderEmptyArray();
  
  const isAllObjects = arr.every(item => 
    item && typeof item === 'object' && !Array.isArray(item)
  );
  
  return isAllObjects ? renderObjectArray(arr) : renderPrimitiveArray(arr);
};

const renderObjectValue = (obj) => {
  const entries = Object.entries(obj || {});
  if (entries.length === 0) return document.createTextNode('{}');
  
  const tbody = createElement('tbody', {},
    entries.map(([key, value]) => createElement('tr', {}, [
      createElement('td', { style: tableStyles.td, textContent: key }),
      createTableCell(createValueNode(value)),
    ]))
  );
  
  const table = createElement('table', { style: tableStyles.table }, [
    createTableHeader(['Key', 'Value']),
    tbody,
  ]);
  
  return createCollapsible('Object', table);
};

const createValueNode = (value) => {
  if (value == null) return document.createTextNode('');
  
  const type = typeof value;
  
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return document.createTextNode(String(value));
  }
  
  if (value instanceof Date) {
    return document.createTextNode(value.toISOString());
  }
  
  if (Array.isArray(value)) {
    return renderArrayValue(value);
  }
  
  if (type === 'object') {
    return renderObjectValue(value);
  }
  
  return document.createTextNode(String(value));
};

// =============================================================================
// Results Rendering
// =============================================================================

const parseJson = (json) => {
  try {
    return { ok: true, data: JSON.parse(json) };
  } catch (error) {
    return { ok: false, error };
  }
};

const renderResultsTable = (cols, rows) => {
  const tbody = createElement('tbody', {},
    rows.map(row => createElement('tr', {},
      cols.map(col => createTableCell(createValueNode(row[col] ?? '')))
    ))
  );
  
  return createElement('table', { 
    style: { ...tableStyles.table, marginTop: '8px' } 
  }, [createTableHeader(cols), tbody]);
};

const renderResults = (resultJson) => {
  const container = elements.results();
  const sqlOut = elements.sqlOut();
  const jsonOut = elements.jsonOut();
  
  clearElement(container);
  
  const parsed = parseJson(resultJson);
  
  if (!parsed.ok) {
    sqlOut.textContent = `Failed to parse result: ${parsed.error}`;
    return;
  }
  
  const { data } = parsed;
  
  if (data.output?.error) {
    sqlOut.textContent = data.output.error;
    jsonOut && (jsonOut.textContent = JSON.stringify(data, null, 2));
    return;
  }
  
  sqlOut.textContent = data.sql || '';
  
  const { cols = [], rows = [] } = data;
  
  if (cols.length === 0 && rows.length === 0) {
    container.textContent = '(no results)';
  } else {
    container.appendChild(renderResultsTable(cols, rows));
  }
  
  jsonOut && (jsonOut.textContent = JSON.stringify(data.output || data, null, 2));
};

// =============================================================================
// Pyodide Runtime
// =============================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const writeFileToFS = async (pyodide, url, destPath) => {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  
  const buffer = new Uint8Array(await response.arrayBuffer());
  const dirPath = destPath.substring(0, destPath.lastIndexOf('/')) || '/';
  
  pyodide.FS.mkdirTree(dirPath);
  pyodide.FS.writeFile(destPath, buffer);
  
  return buffer.length;
};

const createProgressReporter = (enabled) => ({
  log: enabled ? overlayUI.appendLog : () => {},
  markStep: enabled ? overlayUI.markStepDone : () => {},
});

const initializeRuntime = async (showProgress = true) => {
  const { log, markStep } = createProgressReporter(showProgress);
  
  try {
    if (showProgress) {
      overlayUI.show(true);
      overlayUI.setStatus('Initializing runtime...');
      overlayUI.renderSteps(INIT_STEPS);
    }
    
    // Step 0: Load Pyodide
    log('Loading Pyodide...');
    const pyodide = await loadPyodide({ indexURL: CONFIG.PYODIDE_INDEX_URL });
    markStep(0);
    
    // Step 1: Load core packages
    log('Loading packages (micropip, sqlite3)...');
    await Promise.all([
      pyodide.loadPackage('micropip'),
      pyodide.loadPackage('sqlite3'),
    ]);
    markStep(1);
    
    // Step 2: Install wheel
    log(`Installing ${CONFIG.WHEEL_URL}...`);
    await pyodide.runPythonAsync(`
      import micropip
      await micropip.install("${CONFIG.WHEEL_URL}")
    `);
    markStep(2);
    
    // Step 3: Load demo database
    log('Fetching demo.sqlite into Pyodide FS...');
    await writeFileToFS(pyodide, CONFIG.DEMO_ASSET_PATH, CONFIG.DB_PATH);
    elements.dbPathLabel().textContent = CONFIG.DB_PATH;
    markStep(3);
    
    // Step 4: Initialize Python runner
    log('Preparing Python runner...');
    await pyodide.runPythonAsync(createPythonRunnerCode(CONFIG.DB_PATH));
    const schema = await pyodide.runPythonAsync(`load_db(${JSON.stringify(CONFIG.DB_PATH)})`);
    console.info('Initial schema:', schema);
    const schemaOutEl = elements.schemaOut();
    if (schemaOutEl) elements.schemaOut().textContent = schema || '';
    log('Schema loaded.');
    markStep(4);
    // Fetch schema from Python and display
    try {
      log('Fetching DB schema from Python runner...');
      const schemaJson = await pyodide.runPythonAsync('get_schema()');
      console.log('Schema JSON:', schemaJson);
      const schemaOutEl = elements.schemaOut();``
      if (schemaOutEl) schemaOutEl.textContent = schemaJson || '';
    } catch (err) {
      overlayUI.appendLog('Failed to get schema: ' + (err?.stack || String(err)));
    }
    
    log('Ready. You can run queries now.');
    
    pyodideStore.set(pyodide);
    elements.btnRun().disabled = false;
    overlayUI.setStatus('Ready');
    
    if (showProgress) {
      await sleep(CONFIG.SUCCESS_DISPLAY_MS);
      overlayUI.show(false);
    }
    
    return true;
  } catch (error) {
    console.error(error);
    overlayUI.appendLog(error?.stack || String(error));
    overlayUI.setStatus('Error');
    overlayUI.show(false);
    return false;
  }
};

// =============================================================================
// Query Execution
// =============================================================================

const executeQuery = async (queryText) => {
  const pyodide = pyodideStore.get();
  
  if (!pyodide) {
    throw new Error('Runtime not initialized');
  }
  
  pyodide.globals.set('EDGEQL_TEXT', queryText);
  return pyodide.runPythonAsync('run_edgeql(EDGEQL_TEXT)');
};

// =============================================================================
// Event Handlers
// =============================================================================

const handleRun = async () => {
  try {
    const query = elements.query().value;
    const result = await executeQuery(query);
    renderResults(result);
  } catch (error) {
    console.error(error);
    elements.sqlOut().textContent = error?.stack || String(error);
  }
};

const handleQueryKeydown = (event) => {
  const isRunShortcut = event.key === 'Enter' && (event.ctrlKey || event.metaKey);
  if (isRunShortcut) {
    event.preventDefault();
    elements.btnRun().click();
  }
};

// =============================================================================
// Initialization
// =============================================================================

const bindEventListeners = () => {
  elements.btnRun().onclick = handleRun;
  elements.query().addEventListener('keydown', handleQueryKeydown);
  
  const tabTable = elements.tabTable();
  const tabJson = elements.tabJson();
  
  if (tabTable && tabJson) {
    tabTable.addEventListener('click', () => setActiveTab('table'));
    tabJson.addEventListener('click', () => setActiveTab('json'));
    setActiveTab('table');
  }
};

const init = () => {
  bindEventListeners();
  setTimeout(() => initializeRuntime(true), CONFIG.INIT_DELAY_MS);
};

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}