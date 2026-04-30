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
  stableHash32
} from "./LabScaffold.jsx";
import { trackingProps, withUtm } from "../analytics/tracking.js";

const PRIMES = [3, 7, 17, 37, 73];
const DICTIONARY_SOURCE_URL =
  "https://github.com/dotnet/runtime/blob/release/10.0/src/libraries/System.Private.CoreLib/src/System/Collections/Generic/Dictionary.cs";
const DICTIONARY_DOCS_URL = "https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.dictionary-2?view=net-10.0";
const DICTIONARY_ADD_DOCS_URL = "https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.dictionary-2.add?view=net-10.0";
const DICTIONARY_TRY_GET_VALUE_DOCS_URL =
  "https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.dictionary-2.trygetvalue?view=net-10.0";

function createDictionaryModel() {
  return {
    buckets: null,
    entries: null,
    count: 0,
    freeList: -1,
    freeCount: 0,
    version: 0,
    fastModMultiplier: null,
    step: 0,
    title: "Ready",
    detail: "Enter a key and value, then run Add or Get.",
    code: "Dictionary<string, string> dictionary = new();",
    log: [],
    currentHash: null,
    currentBucket: null,
    activeBucket: null,
    activeEntry: null,
    compareEntry: null,
    result: "-",
    resize: null,
    focus: []
  };
}

function cloneDictionaryModel(source) {
  return {
    ...source,
    buckets: source.buckets ? source.buckets.slice() : null,
    entries: source.entries ? source.entries.map((entry) => (entry ? { ...entry } : null)) : null,
    log: source.log.map((item) => ({ ...item })),
    resize: source.resize
      ? {
          oldBuckets: source.resize.oldBuckets.slice(),
          newBuckets: source.resize.newBuckets.slice(),
          movingEntry: source.resize.movingEntry,
          oldSize: source.resize.oldSize,
          newSize: source.resize.newSize
        }
      : null,
    focus: source.focus.slice()
  };
}

function nextPrime(current) {
  const minimum = Math.max(0, current * 2);
  return PRIMES.find((size) => size > minimum) || minimum * 2 + 1;
}

function capacity(model) {
  return model.entries ? model.entries.length : 0;
}

function entryLabel(index) {
  return index < 0 ? "-1" : `e${index}`;
}

function bucketIndex(model, hashCode, length = model.buckets.length) {
  return hashCode % length;
}

function formatBucketFormula(hashCode, length, bucket) {
  return `${hashCode} % ${length} = ${bucket}`;
}

function chainFor(model, bucket) {
  const chain = [];
  if (!model.buckets || !model.entries) return chain;

  let index = model.buckets[bucket] - 1;
  const guard = new Set();

  while (index >= 0 && !guard.has(index)) {
    guard.add(index);
    const entry = model.entries[index];
    if (!entry) break;
    chain.push(index);
    index = entry.next;
  }

  return chain;
}

function beginOperation(model) {
  model.activeBucket = null;
  model.activeEntry = null;
  model.compareEntry = null;
  model.currentHash = null;
  model.currentBucket = null;
  model.result = "-";
  model.resize = null;
  model.focus = [];
}

function stage(model, timeline, title, detail, code, focus = []) {
  model.step += 1;
  model.title = title;
  model.detail = detail;
  model.code = code;
  model.focus = focus;
  model.log.unshift({ index: model.step, title, detail });
  model.log = model.log.slice(0, MAX_LOG_ITEMS);
  timeline.push(cloneDictionaryModel(model));
}

function ensureInitialized(model, timeline) {
  if (model.buckets) return;

  const size = nextPrime(0);
  model.buckets = Array(size).fill(0);
  model.entries = Array(size).fill(null);
  model.freeList = -1;
  model.fastModMultiplier = "HashHelpers.GetFastModMultiplier";

  stage(
    model,
    timeline,
    "Initialize(0)",
    `Created int[] _buckets and Entry[] _entries with length ${size}. The size is selected through the same HashHelpers.GetPrime idea.`,
    `int size = HashHelpers.GetPrime(0); // ${size}\n_buckets = new int[size];\n_entries = new Entry[size];\n_freeList = -1;`,
    ["field-buckets", "field-entries"]
  );
}

function resizeFor(model, timeline, hashCode) {
  const oldSize = model.entries.length;
  const newSize = nextPrime(oldSize);
  const oldBuckets = model.buckets.slice();

  model.resize = {
    oldBuckets,
    newBuckets: Array(newSize).fill(0),
    movingEntry: null,
    oldSize,
    newSize
  };
  model.buckets = Array(newSize).fill(0);
  model.entries.length = newSize;

  stage(
    model,
    timeline,
    `Resize(${newSize})`,
    "_count == _entries.Length, so Dictionary grows the arrays and rebuilds the bucket chains.",
    `Resize();\nint[] newBuckets = new int[${newSize}];\nEntry[] entries = _entries;`,
    ["resizeLane", "field-count"]
  );

  for (let i = 0; i < model.count; i += 1) {
    const entry = model.entries[i];
    if (!entry) continue;

    const newBucket = bucketIndex(model, entry.hashCode, newSize);
    model.resize.movingEntry = i;
    model.resize.newBuckets[newBucket] = i + 1;
    entry.next = model.buckets[newBucket] - 1;
    model.buckets[newBucket] = i + 1;
    model.activeEntry = i;
    model.activeBucket = newBucket;

    stage(
      model,
      timeline,
      `Rehash e${i}`,
      `Entry e${i} moves to bucket ${newBucket}: ${formatBucketFormula(entry.hashCode, newSize, newBucket)}.`,
      `int bucketIndex = (int)(entries[${i}].hashCode % ${newSize}); // ${formatBucketFormula(entry.hashCode, newSize, newBucket)}\nref int bucket = ref newBuckets[bucketIndex];\nentries[${i}].next = bucket - 1;\nbucket = ${i + 1};`,
      [`entry-${i}`, `bucket-${newBucket}`, "resizeLane"]
    );
  }

  model.resize = null;
  model.activeEntry = null;
  model.activeBucket = bucketIndex(model, hashCode);

  stage(
    model,
    timeline,
    "Resize complete",
    `The bucket for the current key was recomputed: ${formatBucketFormula(hashCode, model.buckets.length, model.activeBucket)}.`,
    `int bucketIndex = (int)(hashCode % ${model.buckets.length}); // ${formatBucketFormula(hashCode, model.buckets.length, model.activeBucket)}\nbucket = ref _buckets[bucketIndex];`,
    [`bucket-${model.activeBucket}`]
  );
}

export default function DictionaryLab() {
  const [keyInput, setKeyInput] = useState("Aa");
  const [valueInput, setValueInput] = useState("first");
  const [model, setModel] = useState(createDictionaryModel);
  const [timeline, setTimeline] = useState([]);
  const [timelineIndex, setTimelineIndex] = useState(-1);
  const [toast, setToast] = useState("");
  const keyInputRef = useRef(null);
  const valueInputRef = useRef(null);
  const toastTimerRef = useRef(null);

  const focusSet = useMemo(() => new Set(model.focus), [model.focus]);
  const locked = timeline.length > 0 && timelineIndex !== timeline.length - 1;

  useEffect(() => {
    document.title = "Dictionary<TKey,TValue> visual lab";
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
    setModel(cloneDictionaryModel(nextTimeline[0]));
  }

  function addOperation() {
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

    const work = cloneDictionaryModel(model);
    const nextTimeline = [];
    beginOperation(work);
    ensureInitialized(work, nextTimeline);

    const hashCode = stableHash32(key);
    work.currentHash = hashCode;
    stage(
      work,
      nextTimeline,
      "TryInsert: hashCode",
      `For key = "${key}", uint hashCode = ${hashCode}.`,
      `uint hashCode = (uint)_comparer.GetHashCode(key);\n// demo hashCode = ${hashCode}`,
      ["metric-hash"]
    );

    let bucket = bucketIndex(work, hashCode);
    const addBucketFormula = formatBucketFormula(hashCode, work.buckets.length, bucket);
    work.currentBucket = bucket;
    work.activeBucket = bucket;
    let i = work.buckets[bucket] - 1;

    stage(
      work,
      nextTimeline,
      "GetBucket(hashCode)",
      `Bucket index formula: hashCode % buckets.Length = ${addBucketFormula}. _buckets[${bucket}] stores ${work.buckets[bucket]}; the current entry index is bucket - 1 = ${i}.`,
      `int bucketIndex = (int)(hashCode % ${work.buckets.length}); // ${addBucketFormula}\nref int bucket = ref _buckets[bucketIndex];\nint i = bucket - 1;`,
      [`bucket-${bucket}`]
    );

    let collisionCount = 0;
    while (i >= 0) {
      const entry = work.entries[i];
      work.compareEntry = i;

      stage(
        work,
        nextTimeline,
        `Compare e${i}`,
        `Compare hashCode and key in Entry e${i}.`,
        `if (entries[${i}].hashCode == hashCode && comparer.Equals(entries[${i}].key, key))`,
        [`entry-${i}`, `bucket-${bucket}`]
      );

      if (entry.hashCode === hashCode && entry.key === key) {
        work.result = "duplicate";
        stage(
          work,
          nextTimeline,
          "Duplicate key",
          "Dictionary.Add uses ThrowOnExisting, so this Add would throw ArgumentException.",
          "ThrowHelper.ThrowAddingDuplicateWithKeyArgumentException(key);",
          [`entry-${i}`]
        );
        commitTimeline(nextTimeline);
        return;
      }

      i = entry.next;
      collisionCount += 1;
      if (collisionCount > work.entries.length) {
        stage(
          work,
          nextTimeline,
          "Concurrent operation detected",
          "A chain longer than the array is treated as corruption from a concurrent write.",
          "ThrowHelper.ThrowInvalidOperationException_ConcurrentOperationsNotSupported();",
          [`bucket-${bucket}`]
        );
        commitTimeline(nextTimeline);
        return;
      }
    }

    if (work.count === work.entries.length) {
      resizeFor(work, nextTimeline, hashCode);
      bucket = bucketIndex(work, hashCode);
      work.currentBucket = bucket;
    }

    const index = work.count;
    const previousHead = work.buckets[bucket] - 1;
    work.entries[index] = { hashCode, next: previousHead, key, value };
    work.buckets[bucket] = index + 1;
    work.count += 1;
    work.version += 1;
    work.activeBucket = bucket;
    work.activeEntry = index;
    work.compareEntry = null;
    work.result = `e${index}`;

    stage(
      work,
      nextTimeline,
      "Entry written",
      `New Entry e${index} became the head of bucket ${bucket}. _buckets stores ${index + 1} because the index is 1-based.`,
      `ref Entry entry = ref entries![${index}];\nentry.hashCode = hashCode;\nentry.next = bucket - 1; // ${previousHead}\nentry.key = key;\nentry.value = value;\nbucket = ${index + 1};\n_version++;`,
      [`entry-${index}`, `bucket-${bucket}`, "field-version"]
    );

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

    const work = cloneDictionaryModel(model);
    const nextTimeline = [];
    beginOperation(work);

    if (!work.buckets) {
      work.result = "false";
      stage(
        work,
        nextTimeline,
        "FindValue: empty",
        "_buckets == null, so lookup immediately returns not found.",
        "if (_buckets != null) { ... }\nreturn ref Unsafe.NullRef<TValue>();",
        ["field-buckets"]
      );
      commitTimeline(nextTimeline);
      return;
    }

    const hashCode = stableHash32(key);
    work.currentHash = hashCode;
    stage(
      work,
      nextTimeline,
      "FindValue: hashCode",
      `For key = "${key}", uint hashCode = ${hashCode}.`,
      "uint hashCode = (uint)_comparer.GetHashCode(key);",
      ["metric-hash"]
    );

    const bucket = bucketIndex(work, hashCode);
    const getBucketFormula = formatBucketFormula(hashCode, work.buckets.length, bucket);
    work.currentBucket = bucket;
    work.activeBucket = bucket;
    let i = work.buckets[bucket] - 1;

    stage(
      work,
      nextTimeline,
      "Read bucket",
      `Bucket index formula: hashCode % buckets.Length = ${getBucketFormula}. _buckets[${bucket}] = ${work.buckets[bucket]}, so the first entry index is ${i}.`,
      `int bucketIndex = (int)(hashCode % ${work.buckets.length}); // ${getBucketFormula}\nint i = _buckets[bucketIndex];\ni--; // _buckets is 1-based`,
      [`bucket-${bucket}`]
    );

    let collisionCount = 0;
    while (i >= 0) {
      const entry = work.entries[i];
      work.compareEntry = i;
      stage(
        work,
        nextTimeline,
        `Check e${i}`,
        "Compare hashCode and key. If they match, return ref entry.value.",
        "if (entry.hashCode == hashCode && comparer.Equals(entry.key, key))\n    goto ReturnFound;",
        [`entry-${i}`, `bucket-${bucket}`]
      );

      if (entry.hashCode === hashCode && entry.key === key) {
        work.result = entry.value;
        work.activeEntry = i;
        stage(
          work,
          nextTimeline,
          "Value found",
          `TryGetValue returned true, value = "${entry.value}".`,
          `value = entries[${i}].value;\nreturn true;`,
          [`entry-${i}`]
        );
        commitTimeline(nextTimeline);
        return;
      }

      i = entry.next;
      collisionCount += 1;
      if (collisionCount > work.entries.length) break;
    }

    work.result = "false";
    work.compareEntry = null;
    stage(
      work,
      nextTimeline,
      "Value not found",
      "The chain ended. TryGetValue returned false.",
      "value = default;\nreturn false;",
      [`bucket-${bucket}`]
    );
    commitTimeline(nextTimeline);
  }

  function goToStep(index) {
    if (!timeline.length) return;
    const nextIndex = Math.max(0, Math.min(index, timeline.length - 1));
    setTimelineIndex(nextIndex);
    setModel(cloneDictionaryModel(timeline[nextIndex]));
  }

  function resetAll() {
    setModel(createDictionaryModel());
    setTimeline([]);
    setTimelineIndex(-1);
    setKeyInput("Aa");
    setValueInput("first");
  }

  return (
    <>
      <main className="lab-app">
        <LabHeader
          activeLab="dictionary"
          title={
            <>
              <span className="type-title-name">Dictionary</span>
              <span className="type-title-generic">&lt;string, string&gt;</span>
            </>
          }
        >
          One thread, one bucket array, and one entry table. The visualization follows{" "}
          <code>TryInsert</code> for <code>Add</code> and <code>FindValue</code> for <code>TryGetValue</code>.
        </LabHeader>

        <section className="controls dictionary-controls" aria-label="Operations">
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
                if (event.key === "Enter") addOperation();
              }}
            />
          </label>
          <button
            className="primary-action"
            type="button"
            disabled={locked}
            onClick={addOperation}
            {...trackingProps({ category: "lab_operation", label: "dictionary_add", placement: "dictionary_controls" })}
          >
            Add
          </button>
          <button
            className="secondary-action"
            type="button"
            disabled={locked}
            onClick={getOperation}
            {...trackingProps({ category: "lab_operation", label: "dictionary_get", placement: "dictionary_controls" })}
          >
            Get
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={resetAll}
            {...trackingProps({ category: "lab_operation", label: "dictionary_reset", placement: "dictionary_controls" })}
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
                <p>This simplified model shows the fields and chains involved in Add and TryGetValue.</p>
              </div>
              <Metrics
                focusSet={focusSet}
                items={[
                  { label: "Count", value: String(model.count - model.freeCount), id: "metric-count", hint: "Live entries: _count - _freeCount" },
                  { label: "Capacity", value: String(capacity(model)), id: "metric-capacity", hint: "_entries.Length" },
                  { label: "Hash code", value: model.currentHash === null ? "-" : String(model.currentHash), id: "metric-hash", hint: "uint hashCode" },
                  { label: "Bucket", value: model.currentBucket === null ? "-" : String(model.currentBucket), id: "metric-bucket", hint: "hashCode % buckets.Length" },
                  { label: "Result", value: model.result, id: "metric-result", hint: "Return value of Add or TryGetValue" }
                ]}
              />
            </div>

            <div className="surface-body">
              <section>
                <SectionTitle title="Dictionary fields" titleHint="Dictionary<string, string> fields">
                  Runtime state
                </SectionTitle>
                <FieldGrid
                  focusSet={focusSet}
                  fields={[
                    {
                      label: "Bucket array",
                      value: model.buckets ? `${model.buckets.length} slots` : "not allocated",
                      id: "field-buckets",
                      hint: "int[]? _buckets",
                      valueHint: model.buckets ? `Length = ${model.buckets.length}` : "_buckets == null"
                    },
                    {
                      label: "Entry table",
                      value: model.entries ? `${model.entries.length} slots` : "not allocated",
                      id: "field-entries",
                      hint: "Entry[]? _entries",
                      valueHint: model.entries ? `Length = ${model.entries.length}` : "_entries == null"
                    },
                    { label: "Allocated entries", value: String(model.count), id: "field-count", hint: "int _count" },
                    {
                      label: "Free-list head",
                      value: model.freeList < 0 ? "none" : `entry ${model.freeList}`,
                      id: "field-freeList",
                      hint: "int _freeList",
                      valueHint: String(model.freeList)
                    },
                    { label: "Free slots", value: String(model.freeCount), id: "field-freeCount", hint: "int _freeCount" },
                    { label: "Version", value: String(model.version), id: "field-version", hint: "int _version" },
                    {
                      label: "Comparer",
                      value: "Default string comparer",
                      id: "field-comparer",
                      hint: "IEqualityComparer<string>? _comparer",
                      valueHint: "EqualityComparer<string>.Default"
                    },
                    {
                      label: "Fast modulo multiplier",
                      value: model.fastModMultiplier ? "ready" : "not initialized",
                      id: "field-fastMod",
                      hint: "ulong _fastModMultiplier",
                      valueHint: model.fastModMultiplier || "not initialized"
                    }
                  ]}
                />
              </section>

              <DictionaryBuckets model={model} focusSet={focusSet} />
              <ResizeLane resize={model.resize} />
              <EntriesTable model={model} focusSet={focusSet} />
            </div>
          </article>
        </section>

        <section className="notes">
          <h2>What is intentionally simplified</h2>
          <ol>
            <li>The hash function is stable and demo-only so the visualization is reproducible.</li>
            <li>The model does not fully implement remove/free-list, but keeps those fields next to the real names.</li>
            <li>
              .NET 10 source:{" "}
              <a
                href={withUtm(DICTIONARY_SOURCE_URL, "dictionary_source", "reference_link")}
                target="_blank"
                rel="noreferrer"
                {...trackingProps({ category: "reference_link", label: "dictionary_source", placement: "dictionary_notes" })}
              >
                Dictionary.cs
              </a>
              . Important locations: <code>TryInsert</code>, <code>FindValue</code>, <code>GetBucket</code>, <code>Entry</code>.
            </li>
            <li>
              Microsoft Learn documentation:{" "}
              <a
                href={withUtm(DICTIONARY_DOCS_URL, "dictionary_docs", "reference_link")}
                target="_blank"
                rel="noreferrer"
                {...trackingProps({ category: "reference_link", label: "dictionary_docs", placement: "dictionary_notes" })}
              >
                Dictionary&lt;TKey,TValue&gt;
              </a>
              ,{" "}
              <a
                href={withUtm(DICTIONARY_ADD_DOCS_URL, "dictionary_add_docs", "reference_link")}
                target="_blank"
                rel="noreferrer"
                {...trackingProps({ category: "reference_link", label: "dictionary_add_docs", placement: "dictionary_notes" })}
              >
                Add
              </a>
              ,{" "}
              <a
                href={withUtm(DICTIONARY_TRY_GET_VALUE_DOCS_URL, "dictionary_try_get_value_docs", "reference_link")}
                target="_blank"
                rel="noreferrer"
                {...trackingProps({ category: "reference_link", label: "dictionary_try_get_value_docs", placement: "dictionary_notes" })}
              >
                TryGetValue
              </a>
              .
            </li>
          </ol>
        </section>
      </main>

      <Toast message={toast} />
    </>
  );
}

function DictionaryBuckets({ model, focusSet }) {
  const length = model.buckets ? model.buckets.length : 0;

  return (
    <section>
      <SectionTitle
        title="Bucket array"
        titleHint="int[] _buckets"
        detailHint={model.buckets ? "0 = empty, value - 1 = Entry index" : "_buckets == null"}
      >
        {model.buckets ? "hashCode % length gives bucket" : "not allocated"}
      </SectionTitle>
      <div className="bucket-grid" style={{ "--cols": Math.min(Math.max(length, 1), 7) }}>
        {!model.buckets ? (
          <div className="bucket">
            <div className="bucket-head">No bucket array</div>
            <div className="chain">
              <div className="empty">Dictionary has not allocated arrays yet.</div>
            </div>
          </div>
        ) : (
          model.buckets.map((value, bucketNo) => (
            <DictionaryBucket key={bucketNo} model={model} bucketNo={bucketNo} value={value} focusSet={focusSet} />
          ))
        )}
      </div>
    </section>
  );
}

function DictionaryBucket({ model, bucketNo, value, focusSet }) {
  const id = `bucket-${bucketNo}`;
  const className = focusClass("bucket", id, focusSet, model.activeBucket === bucketNo ? "active" : "");
  const chain = chainFor(model, bucketNo);

  return (
    <div id={id} className={className}>
      <div className="bucket-head">
        <span>[{bucketNo}]</span>
        <span>{value}</span>
      </div>
      <div className="chain">
        {!chain.length ? (
          <div className="empty">empty</div>
        ) : (
          chain.map((index) => {
            const entry = model.entries[index];
            const active = model.activeEntry === index || model.compareEntry === index;
            return (
              <div key={index} className={active ? "node active" : "node"}>
                <div className="node-id">e{index} next:{entryLabel(entry.next)}</div>
                <div className="node-key">{entry.key}</div>
                <div className="node-value">{entry.value}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ResizeLane({ resize }) {
  return (
    <section className={resize ? "resize-lane visible" : "resize-lane"} id="resizeLane">
      <SectionTitle title="Resize lane" titleHint="Resize()">
        {resize ? `${resize.oldSize} -> ${resize.newSize}` : ""}
      </SectionTitle>
      {resize ? (
        <div className="resize-map">
          <MiniArray values={resize.oldBuckets} movingItem={resize.movingEntry === null ? null : resize.movingEntry + 1} />
          <div className="arrow">-&gt;</div>
          <MiniArray values={resize.newBuckets} movingItem={resize.movingEntry === null ? null : resize.movingEntry + 1} />
        </div>
      ) : null}
    </section>
  );
}

function EntriesTable({ model, focusSet }) {
  return (
    <section>
      <SectionTitle title="Entry table" titleHint="Entry[] _entries" detailHint="struct Entry { uint hashCode; int next; TKey key; TValue value; }">
        Entry layout
      </SectionTitle>
      <table className="entries-table">
        <thead>
          <tr>
            <th><HintLabel tooltip="int index">Index</HintLabel></th>
            <th><HintLabel tooltip="uint hashCode">Hash</HintLabel></th>
            <th><HintLabel tooltip="int next">Next</HintLabel></th>
            <th><HintLabel tooltip="string key">Key</HintLabel></th>
            <th><HintLabel tooltip="string value">Value</HintLabel></th>
          </tr>
        </thead>
        <tbody>
          {!model.entries ? (
            <tr>
              <td className="free" colSpan="5">Entries are not allocated yet</td>
            </tr>
          ) : (
            model.entries.map((entry, index) => {
              const id = `entry-${index}`;
              const active = model.activeEntry === index || model.compareEntry === index;
              const className = focusClass("entry-row", id, focusSet, `${active ? "active" : ""} ${entry ? "" : "free"}`);
              return (
                <tr key={id} id={id} className={className}>
                  <td>e{index}</td>
                  <td>{entry ? entry.hashCode : "-"}</td>
                  <td>{entry ? entry.next : "-"}</td>
                  <td>{entry ? entry.key : "free slot"}</td>
                  <td>{entry ? entry.value : "-"}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
}
