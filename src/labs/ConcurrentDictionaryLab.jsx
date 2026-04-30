import { useEffect, useMemo, useRef, useState } from "react";
import {
  FieldGrid,
  HintLabel,
  LabHeader,
  MAX_LOG_ITEMS,
  Metrics,
  MiniArray,
  Narrator,
  SectionTitle,
  Toast,
  focusClass,
  stableHashInt
} from "./LabScaffold.jsx";
import { trackingProps, withUtm } from "../analytics/tracking.js";

const INITIAL_CAPACITY = 8;
const CONCURRENT_SOURCE_URL =
  "https://github.com/dotnet/runtime/blob/release/10.0/src/libraries/System.Collections.Concurrent/src/System/Collections/Concurrent/ConcurrentDictionary.cs";
const CONCURRENT_DOCS_URL = "https://learn.microsoft.com/en-us/dotnet/api/system.collections.concurrent.concurrentdictionary-2?view=net-10.0";
const CONCURRENT_TRY_ADD_DOCS_URL =
  "https://learn.microsoft.com/en-us/dotnet/api/system.collections.concurrent.concurrentdictionary-2.tryadd?view=net-10.0";
const CONCURRENT_TRY_GET_VALUE_DOCS_URL =
  "https://learn.microsoft.com/en-us/dotnet/api/system.collections.concurrent.concurrentdictionary-2.trygetvalue?view=net-10.0";

function clampConcurrency(value) {
  return Math.max(1, Math.min(8, Math.round(Number(value) || 4)));
}

function createConcurrentModel(concurrencyLevel = 4) {
  const locks = clampConcurrency(concurrencyLevel);
  const capacity = Math.max(INITIAL_CAPACITY, locks * 2);

  return {
    tablesVersion: 1,
    buckets: Array(capacity).fill(null),
    locks: Array.from({ length: locks }, (_, index) => ({ index, held: false })),
    countPerLock: Array(locks).fill(0),
    nodes: [],
    budget: Math.max(1, Math.floor(capacity / locks)),
    growLockArray: true,
    comparer: "EqualityComparer<string>.Default",
    fastModBucketsMultiplier: "HashHelpers.GetFastModMultiplier",
    step: 0,
    title: "Ready",
    detail: "Enter a key and value, then run TryAdd or Get.",
    code: "ConcurrentDictionary<string, string> dictionary = new();",
    log: [],
    currentHash: null,
    currentBucket: null,
    currentLock: null,
    activeBucket: null,
    activeNode: null,
    heldLock: null,
    result: "-",
    grow: null,
    focus: []
  };
}

function cloneConcurrentModel(source) {
  return {
    ...source,
    buckets: source.buckets.slice(),
    locks: source.locks.map((lock) => ({ ...lock })),
    countPerLock: source.countPerLock.slice(),
    nodes: source.nodes.map((node) => ({ ...node })),
    log: source.log.map((item) => ({ ...item })),
    grow: source.grow
      ? {
          oldBuckets: source.grow.oldBuckets.slice(),
          newBuckets: source.grow.newBuckets.slice(),
          movingNode: source.grow.movingNode,
          oldSize: source.grow.oldSize,
          newSize: source.grow.newSize
        }
      : null,
    focus: source.focus.slice()
  };
}

function hashToBucket(model, hashcode, length = model.buckets.length) {
  return (hashcode >>> 0) % length;
}

function lockNoForBucket(model, bucketNo) {
  return bucketNo % model.locks.length;
}

function formatBucketFormula(hashcode, length, bucketNo) {
  const unsignedHash = hashcode >>> 0;
  return hashcode < 0
    ? `(uint)${hashcode} = ${unsignedHash}; ${unsignedHash} % ${length} = ${bucketNo}`
    : `${unsignedHash} % ${length} = ${bucketNo}`;
}

function formatLockFormula(bucketNo, locksLength, lockNo) {
  return `${bucketNo} % ${locksLength} = ${lockNo}`;
}

function nodeLabel(index) {
  return index === null || index === undefined ? "null" : `n${index}`;
}

function chainFor(model, bucketNo, buckets = model.buckets, nodes = model.nodes) {
  const chain = [];
  let nodeIndex = buckets[bucketNo];
  const guard = new Set();

  while (nodeIndex !== null && nodeIndex !== undefined && !guard.has(nodeIndex)) {
    guard.add(nodeIndex);
    const node = nodes[nodeIndex];
    if (!node) break;
    chain.push(nodeIndex);
    nodeIndex = node.next;
  }

  return chain;
}

function beginOperation(model) {
  model.activeBucket = null;
  model.activeNode = null;
  model.currentHash = null;
  model.currentBucket = null;
  model.currentLock = null;
  model.heldLock = null;
  model.result = "-";
  model.grow = null;
  model.focus = [];
  for (const lock of model.locks) lock.held = false;
}

function stage(model, timeline, title, detail, code, focus = []) {
  model.step += 1;
  model.title = title;
  model.detail = detail;
  model.code = code;
  model.focus = focus;
  model.log.unshift({ index: model.step, title, detail });
  model.log = model.log.slice(0, MAX_LOG_ITEMS);
  timeline.push(cloneConcurrentModel(model));
}

function growTable(model, timeline, hashcode) {
  const oldBuckets = model.buckets.slice();
  const oldNodes = model.nodes.map((node) => ({ ...node }));
  const oldSize = model.buckets.length;
  const newSize = oldSize * 2 + 1;

  model.grow = {
    oldBuckets,
    newBuckets: Array(newSize).fill(null),
    movingNode: null,
    oldSize,
    newSize
  };
  for (const lock of model.locks) lock.held = true;

  stage(
    model,
    timeline,
    "GrowTable: acquire all locks",
    "GrowTable holds all locks so it can safely create a new Tables instance and copy the chains.",
    `AcquireAllLocks(ref locksAcquired);\nvar newBuckets = new VolatileNode[${newSize}];`,
    model.locks.map((lock) => `lock-${lock.index}`)
  );

  const newBuckets = Array(newSize).fill(null);
  const newCountPerLock = Array(model.locks.length).fill(0);
  model.nodes = [];
  model.buckets = newBuckets;

  for (let oldBucket = 0; oldBucket < oldBuckets.length; oldBucket += 1) {
    for (const nodeIndex of chainFor(model, oldBucket, oldBuckets, oldNodes)) {
      const oldNode = oldNodes[nodeIndex];
      const copiedIndex = model.nodes.length;
      const newBucket = hashToBucket(model, oldNode.hashcode, newSize);
      const newLock = lockNoForBucket(model, newBucket);

      model.nodes.push({
        key: oldNode.key,
        value: oldNode.value,
        hashcode: oldNode.hashcode,
        next: newBuckets[newBucket]
      });
      newBuckets[newBucket] = copiedIndex;
      newCountPerLock[newLock] += 1;
      model.grow.movingNode = nodeIndex;
      model.grow.newBuckets[newBucket] = copiedIndex;
      model.activeBucket = newBucket;
      model.activeNode = copiedIndex;

      stage(
        model,
        timeline,
        `Copy n${nodeIndex}`,
        `Node n${nodeIndex} is copied into new bucket ${newBucket}: ${formatBucketFormula(oldNode.hashcode, newSize, newBucket)}. The real implementation creates a new Node.`,
        `uint bucketNo = (uint)current._hashcode % ${newSize}; // ${formatBucketFormula(oldNode.hashcode, newSize, newBucket)}\nnewBuckets[bucketNo] = new Node(current._key, current._value, current._hashcode, newBuckets[bucketNo]);`,
        [`bucket-${newBucket}`, `node-${copiedIndex}`, "growLane"]
      );
    }
  }

  model.buckets = newBuckets;
  model.countPerLock = newCountPerLock;
  model.budget = Math.max(1, Math.floor(newSize / model.locks.length));
  model.tablesVersion += 1;
  model.grow = null;
  for (const lock of model.locks) lock.held = false;
  const newBucketForCurrent = hashToBucket(model, hashcode);
  model.activeBucket = newBucketForCurrent;

  stage(
    model,
    timeline,
    "Publish new Tables",
    `_tables was replaced with a new Tables instance. New _budget = ${model.budget}.`,
    "_tables = new Tables(newBuckets, newLocks, newCountPerLock, tables._comparer);\n_budget = Math.Max(1, newBuckets.Length / newLocks.Length);",
    ["field-tables", "field-budget", `bucket-${newBucketForCurrent}`]
  );
}

export default function ConcurrentDictionaryLab() {
  const [keyInput, setKeyInput] = useState("Aa");
  const [valueInput, setValueInput] = useState("first");
  const [concurrencyInput, setConcurrencyInput] = useState("4");
  const [model, setModel] = useState(() => createConcurrentModel(4));
  const [timeline, setTimeline] = useState([]);
  const [timelineIndex, setTimelineIndex] = useState(-1);
  const [toast, setToast] = useState("");
  const keyInputRef = useRef(null);
  const valueInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  const focusSet = useMemo(() => new Set(model.focus), [model.focus]);
  const locked = timeline.length > 0 && timelineIndex !== timeline.length - 1;

  useEffect(() => {
    document.title = "ConcurrentDictionary<TKey,TValue> visual lab";
    return () => window.clearTimeout(toastTimerRef.current);
  }, []);

  function showToast(message) {
    window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(""), 2400);
  }

  function commitTimeline(nextTimeline) {
    if (!nextTimeline.length) return;
    setTimeline(nextTimeline);
    setTimelineIndex(0);
    setModel(cloneConcurrentModel(nextTimeline[0]));
  }

  function tryAddOperation() {
    if (locked) {
      showToast("Finish the current operation before starting another one.");
      return;
    }

    const key = keyInput.trim();
    const value = valueInput.trim();
    if (!key) {
      showToast("key must not be empty.");
      keyInputRef.current?.focus();
      return;
    }

    const work = cloneConcurrentModel(model);
    const nextTimeline = [];
    beginOperation(work);

    const hashcode = stableHashInt(key);
    work.currentHash = hashcode;

    stage(
      work,
      nextTimeline,
      "Read volatile _tables",
      "The method first reads the current Tables instance. During grow, _tables is replaced as a whole.",
      "Tables tables = _tables;\nIEqualityComparer<TKey>? comparer = tables._comparer;",
      ["field-tables"]
    );

    stage(
      work,
      nextTimeline,
      "GetHashCode",
      `For key = "${key}", int hashcode = ${hashcode}.`,
      `int hashcode = GetHashCode(comparer, key);\n// demo hashcode = ${hashcode}`,
      ["metric-hash"]
    );

    let bucketNo = hashToBucket(work, hashcode);
    let lockNo = lockNoForBucket(work, bucketNo);
    const addBucketFormula = formatBucketFormula(hashcode, work.buckets.length, bucketNo);
    const addLockFormula = formatLockFormula(bucketNo, work.locks.length, lockNo);
    work.currentBucket = bucketNo;
    work.currentLock = lockNo;
    work.activeBucket = bucketNo;

    stage(
      work,
      nextTimeline,
      "GetBucketAndLock",
      `Bucket formula: (uint)hashcode % buckets.Length = ${addBucketFormula}. Lock formula: bucketNo % locks.Length = ${addLockFormula}. Writes are protected only by this lock.`,
      `uint bucketNo = (uint)hashcode % (uint)tables._buckets.Length; // ${addBucketFormula}\nuint lockNo = bucketNo % (uint)tables._locks.Length; // ${addLockFormula}\nref Node? bucket = ref tables._buckets[bucketNo]._node;`,
      [`bucket-${bucketNo}`, `lock-${lockNo}`]
    );

    work.locks[lockNo].held = true;
    work.heldLock = lockNo;
    stage(
      work,
      nextTimeline,
      "Enter lock",
      `Monitor.Enter for _locks[${lockNo}]. Other lock stripes can continue working.`,
      `lock (locks[${lockNo}])\n{\n    if (tables != _tables) retry;\n}`,
      [`lock-${lockNo}`]
    );

    let nodeIndex = work.buckets[bucketNo];
    while (nodeIndex !== null) {
      const node = work.nodes[nodeIndex];
      work.activeNode = nodeIndex;

      stage(
        work,
        nextTimeline,
        `Compare n${nodeIndex}`,
        `Check _hashcode and _key in Node n${nodeIndex}.`,
        "if (hashcode == node._hashcode && NodeEqualsKey(comparer, node, key))\n    return false;",
        [`node-${nodeIndex}`, `bucket-${bucketNo}`]
      );

      if (node.hashcode === hashcode && node.key === key) {
        work.result = "false";
        work.locks[lockNo].held = false;
        work.heldLock = null;
        stage(
          work,
          nextTimeline,
          "Key already exists",
          "TryAdd does not change the value of an existing key and returns false.",
          "resultingValue = node._value;\nreturn false;",
          [`node-${nodeIndex}`]
        );
        commitTimeline(nextTimeline);
        return;
      }

      nodeIndex = node.next;
    }

    const newIndex = work.nodes.length;
    const previousHead = work.buckets[bucketNo];
    work.nodes.push({ key, value, hashcode, next: previousHead });
    work.buckets[bucketNo] = newIndex;
    work.countPerLock[lockNo] += 1;
    work.activeNode = newIndex;
    work.result = "true";
    const resizeDesired = work.countPerLock[lockNo] > work.budget;

    stage(
      work,
      nextTimeline,
      "Volatile.Write bucket",
      `Created Node n${newIndex}. It became the head of bucket ${bucketNo}; _countPerLock[${lockNo}] = ${work.countPerLock[lockNo]}.`,
      `var resultNode = new Node(key, value, hashcode, bucket);\nVolatile.Write(ref bucket, resultNode);\ntables._countPerLock[${lockNo}]++;`,
      [`node-${newIndex}`, `bucket-${bucketNo}`, `lock-${lockNo}`]
    );

    work.locks[lockNo].held = false;
    work.heldLock = null;
    stage(
      work,
      nextTimeline,
      "Exit lock",
      resizeDesired
        ? "_countPerLock exceeded _budget. GrowTable starts after leaving the lock."
        : "TryAdd is complete; grow is not needed.",
      resizeDesired ? `resizeDesired = true;\nMonitor.Exit(locks[${lockNo}]);` : `Monitor.Exit(locks[${lockNo}]);\nreturn true;`,
      [`lock-${lockNo}`]
    );

    if (resizeDesired) {
      growTable(work, nextTimeline, hashcode);
      bucketNo = hashToBucket(work, hashcode);
      lockNo = lockNoForBucket(work, bucketNo);
      work.currentBucket = bucketNo;
      work.currentLock = lockNo;
    }

    commitTimeline(nextTimeline);
  }

  function getOperation() {
    if (locked) {
      showToast("Finish the current operation before starting another one.");
      return;
    }

    const key = keyInput.trim();
    if (!key) {
      showToast("key must not be empty.");
      keyInputRef.current?.focus();
      return;
    }

    const work = cloneConcurrentModel(model);
    const nextTimeline = [];
    beginOperation(work);

    const hashcode = stableHashInt(key);
    work.currentHash = hashcode;

    stage(
      work,
      nextTimeline,
      "TryGetValue: read _tables",
      "TryGetValue does not take a lock. It reads Tables and walks the volatile bucket chain.",
      "Tables tables = _tables;\nIEqualityComparer<TKey>? comparer = tables._comparer;",
      ["field-tables"]
    );

    stage(
      work,
      nextTimeline,
      "GetHashCode",
      `For key = "${key}", int hashcode = ${hashcode}.`,
      "int hashcode = GetHashCode(comparer, key);",
      ["metric-hash"]
    );

    const bucketNo = hashToBucket(work, hashcode);
    const getBucketFormula = formatBucketFormula(hashcode, work.buckets.length, bucketNo);
    work.currentBucket = bucketNo;
    work.activeBucket = bucketNo;

    stage(
      work,
      nextTimeline,
      "GetBucket",
      `Bucket formula: (uint)hashcode % buckets.Length = ${getBucketFormula}. Read bucket ${bucketNo}; no lock is taken.`,
      `uint bucketNo = (uint)hashcode % (uint)tables._buckets.Length; // ${getBucketFormula}\nfor (Node? n = tables._buckets[bucketNo]._node; n is not null; n = n._next)`,
      [`bucket-${bucketNo}`]
    );

    let nodeIndex = work.buckets[bucketNo];
    while (nodeIndex !== null) {
      const node = work.nodes[nodeIndex];
      work.activeNode = nodeIndex;
      stage(
        work,
        nextTimeline,
        `Compare n${nodeIndex}`,
        "Compare hashcode and key. On match, return value.",
        "if (hashcode == n._hashcode && comparer.Equals(n._key, key))\n    return true;",
        [`node-${nodeIndex}`, `bucket-${bucketNo}`]
      );

      if (node.hashcode === hashcode && node.key === key) {
        work.result = node.value;
        stage(
          work,
          nextTimeline,
          "Value found",
          `TryGetValue returned true, value = "${node.value}".`,
          "value = n._value;\nreturn true;",
          [`node-${nodeIndex}`]
        );
        commitTimeline(nextTimeline);
        return;
      }

      nodeIndex = node.next;
    }

    work.result = "false";
    work.activeNode = null;
    stage(
      work,
      nextTimeline,
      "Value not found",
      "The chain ended. TryGetValue returned false.",
      "value = default;\nreturn false;",
      [`bucket-${bucketNo}`]
    );
    commitTimeline(nextTimeline);
  }

  function goToStep(index) {
    if (!timeline.length) return;
    const nextIndex = Math.max(0, Math.min(index, timeline.length - 1));
    setTimelineIndex(nextIndex);
    setModel(cloneConcurrentModel(timeline[nextIndex]));
  }

  function resetAll(keepInputs = false, nextConcurrency = concurrencyInput) {
    const concurrencyLevel = clampConcurrency(nextConcurrency);
    setConcurrencyInput(String(concurrencyLevel));
    setModel(createConcurrentModel(concurrencyLevel));
    setTimeline([]);
    setTimelineIndex(-1);
    setKeyInput(keepInputs ? keyInput : "Aa");
    setValueInput(keepInputs ? valueInput : "first");
  }

  return (
    <>
      <div className="lab-app">
        <LabHeader
          title={
            <>
              <span className="type-title-name">
                Concurrent<wbr />Dictionary
              </span>
              <span className="type-title-generic">&lt;string, string&gt;</span>
            </>
          }
        >
          This model shows the main runtime pieces: tables, bucket arrays, lock stripes, and per-lock counts. <code>TryAdd</code> takes the
          bucket lock, <code>TryGetValue</code> reads the chain without a lock.
        </LabHeader>

        <section className="controls concurrent-controls" aria-label="Operations">
          <label>
            string key
            <input
              ref={keyInputRef}
              type="text"
              value={keyInput}
              disabled={locked}
              autoComplete="off"
              spellCheck="false"
              onChange={(event) => setKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") valueInputRef.current?.focus();
              }}
            />
          </label>
          <label>
            string value
            <input
              ref={valueInputRef}
              type="text"
              value={valueInput}
              disabled={locked}
              autoComplete="off"
              spellCheck="false"
              onChange={(event) => setValueInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") tryAddOperation();
              }}
            />
          </label>
          <label>
            concurrency
            <input
              type="number"
              min="1"
              max="8"
              step="1"
              value={concurrencyInput}
              disabled={locked}
              onChange={(event) => setConcurrencyInput(event.target.value)}
              onBlur={() => resetAll(true)}
            />
          </label>
          <button
            className="primary-action"
            type="button"
            disabled={locked}
            onClick={tryAddOperation}
            {...trackingProps({ category: "lab_operation", label: "concurrent_dictionary_try_add", placement: "concurrent_dictionary_controls" })}
          >
            TryAdd
          </button>
          <button
            className="secondary-action"
            type="button"
            disabled={locked}
            onClick={getOperation}
            {...trackingProps({ category: "lab_operation", label: "concurrent_dictionary_get", placement: "concurrent_dictionary_controls" })}
          >
            Get
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => resetAll(false)}
            {...trackingProps({ category: "lab_operation", label: "concurrent_dictionary_reset", placement: "concurrent_dictionary_controls" })}
          >
            Reset
          </button>
        </section>

        <section className="workbench">
          <Narrator
            model={model}
            timeline={timeline}
            timelineIndex={timelineIndex}
            onPrevious={() => goToStep(timelineIndex - 1)}
            onNext={() => goToStep(timelineIndex + 1)}
          />

          <article className="surface">
            <div className="surface-head">
              <div className="surface-title">
                <h2>Runtime shape</h2>
                <p>This simplified model shows tables, locks, buckets, and node chains for TryAdd and TryGetValue.</p>
              </div>
              <Metrics
                focusSet={focusSet}
                items={[
                  { label: "Count", value: String(model.nodes.length), id: "metric-count", hint: "Number of Node instances in the demo model" },
                  { label: "Buckets", value: String(model.buckets.length), id: "metric-capacity", hint: "_tables._buckets.Length" },
                  { label: "Hash code", value: model.currentHash === null ? "-" : String(model.currentHash), id: "metric-hash", hint: "int hashcode" },
                  { label: "Bucket", value: model.currentBucket === null ? "-" : String(model.currentBucket), id: "metric-bucket", hint: "(uint)hashcode % buckets.Length" },
                  { label: "Lock", value: model.currentLock === null ? "-" : String(model.currentLock), id: "metric-lock", hint: "bucketNo % locks.Length" },
                  { label: "Result", value: model.result, id: "metric-result", hint: "Return value of TryAdd or TryGetValue" }
                ]}
              />
            </div>

            <div className="surface-body">
              <section>
                <SectionTitle title="Concurrent dictionary fields" titleHint="ConcurrentDictionary<string, string> fields">
                  Runtime state
                </SectionTitle>
                <FieldGrid
                  focusSet={focusSet}
                  fields={[
                    { label: "Tables snapshot", value: `version ${model.tablesVersion}`, id: "field-tables", hint: "volatile Tables _tables" },
                    {
                      label: "Bucket table",
                      value: `${model.buckets.length} buckets`,
                      id: "field-buckets",
                      hint: "VolatileNode[] _buckets",
                      valueHint: `Length = ${model.buckets.length}`
                    },
                    {
                      label: "Lock stripes",
                      value: `${model.locks.length} locks`,
                      id: "field-locks",
                      hint: "object[] _locks",
                      valueHint: `Length = ${model.locks.length}`
                    },
                    {
                      label: "Counts per lock",
                      value: `[${model.countPerLock.join(", ")}]`,
                      id: "field-countPerLock",
                      hint: "int[] _countPerLock"
                    },
                    { label: "Resize budget", value: String(model.budget), id: "field-budget", hint: "int _budget" },
                    {
                      label: "Grow lock array",
                      value: model.growLockArray ? "enabled" : "disabled",
                      id: "field-growLockArray",
                      hint: "bool _growLockArray",
                      valueHint: String(model.growLockArray)
                    },
                    {
                      label: "Comparer",
                      value: "Default string comparer",
                      id: "field-comparer",
                      hint: "IEqualityComparer<string>? _comparer",
                      valueHint: model.comparer
                    },
                    {
                      label: "Fast modulo helper",
                      value: "available",
                      id: "field-fastMod",
                      hint: "ulong _fastModBucketsMultiplier",
                      valueHint: model.fastModBucketsMultiplier
                    }
                  ]}
                />
              </section>

              <Locks model={model} focusSet={focusSet} />
              <ConcurrentBuckets model={model} focusSet={focusSet} />
              <GrowLane grow={model.grow} />
              <NodesTable model={model} focusSet={focusSet} />
            </div>
          </article>
        </section>

        <section className="notes">
          <h2>What is intentionally simplified</h2>
          <ol>
            <li>The hash function is stable and demo-only so the visualization is reproducible.</li>
            <li>The model shows lock striping and grow as an educational sequence, without real multithreaded interleaving.</li>
            <li>
              .NET 10 source:{" "}
              <a
                href={withUtm(CONCURRENT_SOURCE_URL, "concurrent_dictionary_source", "reference_link")}
                target="_blank"
                rel="noreferrer"
                {...trackingProps({ category: "reference_link", label: "concurrent_dictionary_source", placement: "concurrent_dictionary_notes" })}
              >
                ConcurrentDictionary.cs
              </a>
              . Important locations: <code>TryAddInternal</code>, <code>TryGetValue</code>, <code>GetBucketAndLock</code>, <code>Tables</code>,{" "}
              <code>VolatileNode</code>, <code>Node</code>.
            </li>
            <li>
              Microsoft Learn documentation:{" "}
              <a
                href={withUtm(CONCURRENT_DOCS_URL, "concurrent_dictionary_docs", "reference_link")}
                target="_blank"
                rel="noreferrer"
                {...trackingProps({ category: "reference_link", label: "concurrent_dictionary_docs", placement: "concurrent_dictionary_notes" })}
              >
                ConcurrentDictionary&lt;TKey,TValue&gt;
              </a>
              ,{" "}
              <a
                href={withUtm(CONCURRENT_TRY_ADD_DOCS_URL, "concurrent_dictionary_try_add_docs", "reference_link")}
                target="_blank"
                rel="noreferrer"
                {...trackingProps({ category: "reference_link", label: "concurrent_dictionary_try_add_docs", placement: "concurrent_dictionary_notes" })}
              >
                TryAdd
              </a>
              ,{" "}
              <a
                href={withUtm(CONCURRENT_TRY_GET_VALUE_DOCS_URL, "concurrent_dictionary_try_get_value_docs", "reference_link")}
                target="_blank"
                rel="noreferrer"
                {...trackingProps({ category: "reference_link", label: "concurrent_dictionary_try_get_value_docs", placement: "concurrent_dictionary_notes" })}
              >
                TryGetValue
              </a>
              .
            </li>
          </ol>
        </section>
      </div>

      <Toast message={toast} />
    </>
  );
}

function Locks({ model, focusSet }) {
  return (
    <section>
      <SectionTitle title="Lock stripes" titleHint="object[] _locks + int[] _countPerLock" detailHint="lockNo = bucketNo % _locks.Length">
        bucketNo % locks gives lock
      </SectionTitle>
      <div className="locks" style={{ "--lock-cols": Math.min(model.locks.length, 4) }}>
        {model.locks.map((lock) => {
          const id = `lock-${lock.index}`;
          const className = focusClass("lock", id, focusSet, lock.held ? "held" : "");
          return (
            <div key={id} id={id} className={className}>
              <div className="lock-name">
                <HintLabel tooltip={`_locks[${lock.index}]`}>Lock {lock.index}</HintLabel>
              </div>
              <div className="lock-state">{lock.held ? "held" : "free"}</div>
              <div className="lock-state">
                <HintLabel tooltip={`_countPerLock[${lock.index}] = ${model.countPerLock[lock.index]}`}>
                  Count = {model.countPerLock[lock.index]}
                </HintLabel>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ConcurrentBuckets({ model, focusSet }) {
  return (
    <section>
      <SectionTitle title="Bucket table" titleHint="VolatileNode[] _buckets" detailHint="VolatileNode._node is the head Node?">
        hashcode % buckets gives bucket
      </SectionTitle>
      <div className="bucket-grid" style={{ "--cols": Math.min(model.buckets.length, 8) }}>
        {model.buckets.map((value, bucketNo) => (
          <ConcurrentBucket key={bucketNo} model={model} bucketNo={bucketNo} value={value} focusSet={focusSet} />
        ))}
      </div>
    </section>
  );
}

function ConcurrentBucket({ model, bucketNo, value, focusSet }) {
  const id = `bucket-${bucketNo}`;
  const className = focusClass("bucket", id, focusSet, model.activeBucket === bucketNo ? "active" : "");
  const chain = chainFor(model, bucketNo);

  return (
    <div id={id} className={className}>
      <div className="bucket-head">
        <span>[{bucketNo}]</span>
        <span>{nodeLabel(value)}</span>
      </div>
      <div className="chain">
        {!chain.length ? (
          <div className="empty">null</div>
        ) : (
          chain.map((index) => {
            const node = model.nodes[index];
            return (
              <div key={index} className={model.activeNode === index ? "node-card active" : "node-card"}>
                <div className="node-id">n{index} next:{nodeLabel(node.next)}</div>
                <div className="node-key">{node.key}</div>
                <div className="node-value">{node.value}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function GrowLane({ grow }) {
  return (
    <section className={grow ? "grow-lane visible" : "grow-lane"} id="growLane">
      <SectionTitle title="Grow table lane" titleHint="GrowTable">
        {grow ? `${grow.oldSize} -> ${grow.newSize}` : ""}
      </SectionTitle>
      {grow ? (
        <div className="grow-map">
          <MiniArray values={grow.oldBuckets} movingItem={grow.movingNode} columns={8} formatValue={nodeLabel} />
          <div className="arrow">-&gt;</div>
          <MiniArray values={grow.newBuckets} movingItem={null} columns={8} formatValue={nodeLabel} />
        </div>
      ) : null}
    </section>
  );
}

function NodesTable({ model, focusSet }) {
  return (
    <section>
      <SectionTitle title="Node table" titleHint="Node objects" detailHint="sealed class Node { TKey _key; TValue _value; Node? _next; int _hashcode; }">
        Node layout
      </SectionTitle>
      <table className="nodes-table">
        <thead>
          <tr>
            <th><HintLabel tooltip="Node instance label">Node</HintLabel></th>
            <th><HintLabel tooltip="int _hashcode">Hash</HintLabel></th>
            <th><HintLabel tooltip="Node? _next">Next</HintLabel></th>
            <th><HintLabel tooltip="string _key">Key</HintLabel></th>
            <th><HintLabel tooltip="string _value">Value</HintLabel></th>
          </tr>
        </thead>
        <tbody>
          {!model.nodes.length ? (
            <tr>
              <td colSpan="5">empty</td>
            </tr>
          ) : (
            model.nodes.map((node, index) => {
              const id = `node-${index}`;
              const className = focusClass("", id, focusSet, model.activeNode === index ? "focus" : "");
              return (
                <tr key={id} id={id} className={className}>
                  <td>n{index}</td>
                  <td>{node.hashcode}</td>
                  <td>{nodeLabel(node.next)}</td>
                  <td>{node.key}</td>
                  <td>{node.value}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
