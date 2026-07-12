'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRunEvents } from '@/hooks/use-run-events';
import { useCinemaMode } from '@/hooks/use-cinema-mode';
import { CinemaOverlay } from '@/components/cinema/cinema-overlay';
import { NodeContextMenu } from '@/components/cinema/node-context-menu';
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  BackgroundVariant,
  Panel,
  reconnectEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { stringify as yamlStringify, parse as yamlParse } from 'yaml';
import {
  Save,
  Download,
  Sparkles,
  Send,
  Loader2,
  Square,
  AlertTriangle,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  FolderOpen,
  X,
  ExternalLink,
  Code2,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  ChevronUp,
  ChevronDown,
  GripHorizontal,
  Bug,
  Film,
} from 'lucide-react';
import { StepNode } from '@/components/builder/step-node';
import { StepPalette } from '@/components/builder/step-palette';
import { StepConfigPanel } from '@/components/builder/step-config-panel';
import { ConnectionMapperDialog } from '@/components/builder/connection-mapper-dialog';
import { StepCard } from '@/components/step-card';
import { StatusBadge } from '@/components/status-badge';
import { formatDuration } from '@/lib/utils';
import {
  saveManifest,
  exportYaml,
  fetchGrpcIntrospect,
  fetchCatalog,
  fetchTestManifest,
  fetchTests,
  fetchAIStatus,
  aiGenerate,
  aiRefine,
  aiSave,
  runSingleTest,
  fetchRunDetail,
  fetchRuns,
  type TestItem,
  type ProtoServiceInfo,
  type AIStatusResponse,
  type StepResultItem,
  type RunDetail,
  type CatalogEntry,
} from '@/lib/api';
import type { RestServiceInfo, RestEndpointInfo } from '@/components/builder/rest-endpoint-picker';
import type { ProtoMethodInfo } from '@/components/builder/grpc-service-picker';
import { restEndpointToStepConfig, grpcMethodToFullStepConfig } from '@/lib/catalog-to-step';

/* ------------------------------------------------------------------ */
/*  StepData — the canonical shape every builder component depends on */
/* ------------------------------------------------------------------ */

export interface StepData {
  [key: string]: unknown;
  stepId: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  extract: Record<string, string>;
  assertions: Array<{
    type: string;
    path?: string;
    expected?: unknown;
    schema?: string;
    ignore?: string[];
    tolerance?: number;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const nodeTypes: NodeTypes = { stepNode: StepNode };

let nodeIdCounter = 0;
function generateNodeId(): string {
  return `step-${++nodeIdCounter}`;
}

/* ------------------------------------------------------------------ */
/*  Manifest ↔ Nodes conversion                                       */
/* ------------------------------------------------------------------ */

function manifestToNodes(manifest: Record<string, unknown>): { nodes: Node[]; edges: Edge[] } {
  const steps = (manifest.steps ?? []) as Array<Record<string, unknown>>;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  steps.forEach((step, index) => {
    const id = `step-${index + 1}`;
    const type = String(step.type ?? 'apiCall');

    const config: Record<string, unknown> = {};
    if (type === 'apiCall') {
      if (step.method) config.method = step.method;
      if (step.path) config.path = step.path;
      if (step.baseUrl) config.baseUrl = step.baseUrl;
      if (step.signed) config.signed = step.signed;
      if (step.body) config.body = step.body;
      if (step.headers) config.headers = step.headers;
    } else if (type === 'grpcCall') {
      if (step.service) config.service = step.service;
      if (step.rpcMethod) config.rpcMethod = step.rpcMethod;
      if (step.protoFile) config.protoFile = step.protoFile;
      if (step.message) config.message = step.message;
    } else if (type === 'wsSubscribe') {
      if (step.channel) config.channel = step.channel;
      if (step.waitMs) config.waitMs = step.waitMs;
    } else if (type === 'waitUntil') {
      if (step.waitMs) config.waitMs = step.waitMs;
    } else if (type === 'browserAction') {
      if (step.action) config.action = step.action;
      if (step.url) config.url = step.url;
      if (step.selector) config.selector = step.selector;
      if (step.value) config.value = step.value;
      if (step.screenshotName) config.screenshotName = step.screenshotName;
    }

    const extract = (step.extract ?? {}) as Record<string, string>;
    const assertions = ((step.assert ?? []) as Array<Record<string, unknown>>).map((a) => ({
      type: String(a.type ?? 'statusCode'),
      path: a.path as string | undefined,
      expected: a.expected,
    }));

    nodes.push({
      id,
      type: 'stepNode',
      position: { x: 250, y: index * 140 + 50 },
      data: {
        stepId: id,
        name: String(step.name ?? `Step ${index + 1}`),
        type,
        config,
        extract,
        assertions,
      } as StepData,
    });

    if (Array.isArray(step.dependsOn)) {
      for (const dep of step.dependsOn) {
        const sourceIdx = steps.findIndex((s) => s.name === dep);
        if (sourceIdx >= 0) {
          edges.push({
            id: `e-${sourceIdx + 1}-${index + 1}`,
            source: `step-${sourceIdx + 1}`,
            target: id,
            sourceHandle: 't-bottom',
            targetHandle: 't-top',
            animated: true,
            style: { stroke: '#6366f1' },
          });
        }
      }
    }

    if (!step.dependsOn && index > 0) {
      edges.push({
        id: `e-seq-${index}`,
        source: `step-${index}`,
        target: id,
        sourceHandle: 't-bottom',
        targetHandle: 't-top',
        animated: true,
        style: { stroke: '#6366f1' },
      });
    }
  });

  nodeIdCounter = Math.max(nodeIdCounter, steps.length);
  return { nodes, edges };
}

function extractMeta(manifest: Record<string, unknown>) {
  const config = (manifest.config ?? {}) as Record<string, unknown>;
  return {
    id: String(manifest.id ?? ''),
    name: String(manifest.name ?? ''),
    suite: String(manifest.suite ?? ''),
    tags: Array.isArray(manifest.tags) ? manifest.tags.join(', ') : '',
    version: Number(manifest.version ?? 1),
    timeout_ms: Number(config.timeout_ms ?? 10000),
    retries: Number(config.retries ?? 0),
    mode: 'real' as const,
    owner: String(manifest.owner ?? ''),
  };
}

/* ------------------------------------------------------------------ */
/*  AI Chat message type                                               */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  errors?: string[];
}

/* ------------------------------------------------------------------ */
/*  Pending connection type                                            */
/* ------------------------------------------------------------------ */

interface PendingConnection {
  connection: Connection;
  sourceNode: Node;
  targetNode: Node;
}

/* ------------------------------------------------------------------ */
/*  Nested value setter for connection mapping                         */
/* ------------------------------------------------------------------ */

function setNestedValue(obj: Record<string, unknown>, path: string, value: string): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

/* ================================================================== */
/*  BuilderContent — main component                                    */
/* ================================================================== */

function BuilderContent() {
  const searchParams = useSearchParams();
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [protoServices, setProtoServices] = useState<ProtoServiceInfo[]>([]);
  const [restServices, setRestServices] = useState<RestServiceInfo[]>([]);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const autoLoadedRef = useRef(false);

  const [testMeta, setTestMeta] = useState(() => ({
    id: 'test-' + Math.random().toString(36).slice(2, 8),
    name: '',
    suite: '',
    tags: '',
    version: 1,
    timeout_ms: 10000,
    retries: 0,
    mode: 'real' as const,
    owner: '',
  }));

  const [params, setParams] = useState<Array<{ key: string; value: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [builderRunId, setBuilderRunId] = useState<string>(() => `builder-run-${Math.random().toString(36).slice(2, 10)}`);
  const [aiSaving, setAISaving] = useState(false);
  const [aiSaveMsg, setAISaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // YAML editor state
  const [currentYaml, setCurrentYaml] = useState('');
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [yamlPanelHeight, setYamlPanelHeight] = useState(200); // kept for potential future use
  const syncSourceRef = useRef<'diagram' | 'yaml' | 'ai'>('diagram');

  // AI chat state
  const [aiStatus, setAIStatus] = useState<AIStatusResponse | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('claude-opus-4-8');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  // Aborts the in-flight AI request (generate/refine/debug) when the user stops it.
  const chatAbortRef = useRef<AbortController | null>(null);

  const handleChatStop = () => {
    chatAbortRef.current?.abort();
  };

  // Debug mode state
  const [debugMode, setDebugMode] = useState(false);
  const debugLoadedRef = useRef(false);

  // Right panel tab state (moved up for debug mode access)
  const [rightTab, setRightTab] = useState<'ai' | 'yaml'>('ai');
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  // Run state
  const [runStatus, setRunStatus] = useState<'idle' | 'saving' | 'running' | 'passed' | 'failed' | 'error'>('idle');
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const runPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cinema mode state — şimdilik pasif (canlı-run WebSocket'i devre dışı).
  // Yeniden açmak için: true yap (backend hub + /api/runs/{id}/ws hazır).
  const [cinemaEnabled, setCinemaEnabled] = useState(false);
  const [cinemaRunId, setCinemaRunId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; stepIndex: number; stepName: string } | null>(null);
  const totalStepsForCinema = nodes.length;
  const [cinema, cinemaControls] = useCinemaMode(totalStepsForCinema);
  const { connected: wsConnected } = useRunEvents(
    cinemaEnabled ? cinemaRunId : null,
    {
      enabled: cinemaEnabled && !!cinemaRunId,
      onEvent: (evt) => {
        cinemaControls.processEvent(evt);
        // When run completes, also load full detail for bottom panel
        if (evt.type === 'run_completed' && cinemaRunId) {
          fetchRunDetail(cinemaRunId).then((detail) => {
            setRunDetail(detail);
            setRunStatus(detail.status as 'passed' | 'failed' | 'error');
            setBottomPanelOpen(true);
          }).catch(() => {});
        }
      },
    },
  );

  // Apply cinema node states to React Flow nodes
  useEffect(() => {
    if (!cinema.active || cinema.nodeStates.size === 0) return;
    setNodes((nds) =>
      nds.map((node, idx) => {
        const cinState = cinema.nodeStates.get(idx);
        if (!cinState) return node;
        return {
          ...node,
          data: {
            ...node.data,
            cinemaState: cinState.status,
            runStatus: cinState.status === 'waiting' ? undefined : cinState.status,
            runDurationMs: cinState.durationMs,
          },
        };
      }),
    );
  }, [cinema.active, cinema.nodeStates, cinema.currentSeq, setNodes]);

  // Build edge map for extract flows (sourceStepIndex → [targetStepIndexes])
  const extractEdgeMap = useMemo(() => {
    const map = new Map<number, number[]>();
    edges.forEach((edge) => {
      const sourceIdx = parseInt(edge.source.replace('step-', ''), 10);
      const targetIdx = parseInt(edge.target.replace('step-', ''), 10);
      if (!isNaN(sourceIdx) && !isNaN(targetIdx)) {
        const targets = map.get(sourceIdx) ?? [];
        targets.push(targetIdx);
        map.set(sourceIdx, targets);
      }
    });
    return map;
  }, [edges]);

  // Bottom panel state
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(280);
  const bottomPanelRef = useRef<HTMLDivElement>(null);

  // Resize drag state
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // Test loader state
  const [loaderOpen, setLoaderOpen] = useState(false);
  const [loaderTests, setLoaderTests] = useState<TestItem[]>([]);
  const [loaderLoading, setLoaderLoading] = useState(false);
  const [loaderQuery, setLoaderQuery] = useState('');
  const loaderInputRef = useRef<HTMLInputElement>(null);
  const loaderContainerRef = useRef<HTMLDivElement>(null);

  const filteredTests = useMemo(() => {
    if (!loaderQuery.trim()) return loaderTests;
    const q = loaderQuery.toLowerCase();
    return loaderTests.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(q)),
    );
  }, [loaderTests, loaderQuery]);

  /* ── Load proto services + AI status ── */

  useEffect(() => {
    fetchGrpcIntrospect()
      .then(setProtoServices)
      .catch(() => setProtoServices([]));
    fetchCatalog('rest')
      .then((entries: CatalogEntry[]) => {
        const svcs: RestServiceInfo[] = entries
          .filter((e) => e.catalog && (e.catalog as Record<string, unknown>).endpoints)
          .map((e) => ({
            id: e.id,
            name: e.name,
            domain: e.domain,
            target: e.target,
            endpoints: ((e.catalog as Record<string, unknown>).endpoints ?? []) as RestServiceInfo['endpoints'],
          }));
        setRestServices(svcs);
      })
      .catch(() => setRestServices([]));
    fetchAIStatus()
      .then(setAIStatus)
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (loaderOpen && loaderTests.length === 0) {
      setLoaderLoading(true);
      fetchTests()
        .then(setLoaderTests)
        .catch(() => setLoaderTests([]))
        .finally(() => setLoaderLoading(false));
    }
    if (loaderOpen) {
      setTimeout(() => loaderInputRef.current?.focus(), 50);
    }
  }, [loaderOpen, loaderTests.length]);

  useEffect(() => {
    if (!loaderOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (loaderContainerRef.current && !loaderContainerRef.current.contains(e.target as HTMLElement | null)) {
        setLoaderOpen(false);
        setLoaderQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [loaderOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  /* ── Build manifest from diagram ── */

  const buildManifest = useCallback(() => {
    const steps = nodes.map((node) => {
      const d = node.data as StepData;
      const step: Record<string, unknown> = {
        name: d.name,
        type: d.type,
      };

      const cfg = d.config;
      if (d.type === 'apiCall') {
        if (cfg.method) step.method = cfg.method;
        if (cfg.path) step.path = cfg.path;
        if (cfg.baseUrl) step.baseUrl = cfg.baseUrl;
        if (cfg.signed) step.signed = cfg.signed;
        if (cfg.body && Object.keys(cfg.body as object).length > 0) step.body = cfg.body;
        if (cfg.headers && Object.keys(cfg.headers as object).length > 0) step.headers = cfg.headers;
      } else if (d.type === 'grpcCall') {
        if (cfg.service) step.service = cfg.service;
        if (cfg.rpcMethod) step.rpcMethod = cfg.rpcMethod;
        if (cfg.protoFile) step.protoFile = cfg.protoFile;
        if (cfg.message && Object.keys(cfg.message as object).length > 0) step.message = cfg.message;
      } else if (d.type === 'wsSubscribe') {
        if (cfg.channel) step.channel = cfg.channel;
        if (cfg.waitMs) step.waitMs = cfg.waitMs;
      } else if (d.type === 'waitUntil') {
        if (cfg.waitMs) step.waitMs = cfg.waitMs;
      } else if (d.type === 'browserAction') {
        if (cfg.action) step.action = cfg.action;
        if (cfg.url) step.url = cfg.url;
        if (cfg.selector) step.selector = cfg.selector;
        if (cfg.value) step.value = cfg.value;
        if (cfg.screenshotName) step.screenshotName = cfg.screenshotName;
      }

      const incoming = edges.filter((e) => e.target === node.id);
      if (incoming.length > 0) {
        step.dependsOn = incoming.map((e) => {
          const src = nodes.find((n) => n.id === e.source);
          return src?.data.name ?? e.source;
        });
      }

      if (Object.keys(d.extract).length > 0) step.extract = d.extract;
      if (d.assertions.length > 0) step.assert = d.assertions;

      return step;
    });

    const paramsObj: Record<string, string> = {};
    for (const p of params) {
      if (p.key) paramsObj[p.key] = p.value;
    }

    return {
      id: testMeta.id || 'new-test',
      name: testMeta.name || 'New Test',
      suite: testMeta.suite || undefined,
      tags: testMeta.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      version: testMeta.version,
      config: {
        timeout_ms: testMeta.timeout_ms,
        retries: testMeta.retries,
        mode: testMeta.mode,
      },
      params: paramsObj,
      steps,
      ...(testMeta.owner ? { owner: testMeta.owner } : {}),
    };
  }, [nodes, edges, testMeta, params]);

  /* ── Diagram → YAML sync ── */

  useEffect(() => {
    if (syncSourceRef.current !== 'diagram') {
      syncSourceRef.current = 'diagram';
      return;
    }
    try {
      const manifest = buildManifest();
      const yaml = yamlStringify(manifest, { lineWidth: 120 });
      setCurrentYaml(yaml);
      setYamlError(null);
    } catch {
      // ignore serialization errors while editing
    }
  }, [buildManifest]);

  /* ── Apply a parsed manifest to the diagram + meta ── */

  const applyManifest = useCallback(
    (manifest: Record<string, unknown>) => {
      const { nodes: newNodes, edges: newEdges } = manifestToNodes(manifest);
      setNodes(newNodes);
      setEdges(newEdges);
      setSelectedNode(null);

      const meta = extractMeta(manifest);
      setTestMeta(meta);

      if (Array.isArray(manifest.params)) {
        setParams([]);
      } else if (manifest.params && typeof manifest.params === 'object') {
        setParams(
          Object.entries(manifest.params as Record<string, string>).map(([key, value]) => ({
            key,
            value: String(value),
          })),
        );
      }
    },
    [setNodes, setEdges],
  );

  /* ── YAML → Diagram sync (user edits YAML textarea) ── */

  const handleYamlChange = useCallback(
    (value: string) => {
      setCurrentYaml(value);
      try {
        const parsed = yamlParse(value) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          setYamlError(null);
          syncSourceRef.current = 'yaml';
          applyManifest(parsed);
        }
      } catch (err) {
        setYamlError(err instanceof Error ? err.message : 'Invalid YAML');
      }
    },
    [applyManifest],
  );

  /* ── Load existing test ── */

  const handleLoadTest = useCallback(
    async (testId: string) => {
      try {
        const manifest = await fetchTestManifest(testId);
        syncSourceRef.current = 'yaml';
        applyManifest(manifest);
        const yaml = yamlStringify(manifest, { lineWidth: 120 });
        setCurrentYaml(yaml);
        setYamlError(null);
        setLoaderOpen(false);
        setLoaderQuery('');
        // Yeni script yüklenince chat geçmişini temizle — AI hangi scriptle konuştuğunu bilsin
        setChatMessages([]);
        // Yeni script için sabit builder run ID üret
        setBuilderRunId(`builder-${testId}`);
      } catch (err) {
        alert(`Failed to load test: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [applyManifest],
  );

  useEffect(() => {
    const loadId = searchParams.get('load');
    if (loadId && !autoLoadedRef.current) {
      autoLoadedRef.current = true;
      handleLoadTest(loadId);
    }
  }, [searchParams, handleLoadTest]);

  // Deep-link from the Service Catalog "Create test" action:
  //   ?catalog=<entryId>&method=<rpcMethod>       → pre-fill a grpcCall node
  //   ?catalog=<entryId>&endpoint=<METHOD path>   → pre-fill an apiCall node
  const catalogDeepLinkedRef = useRef(false);
  useEffect(() => {
    const catalogId = searchParams.get('catalog');
    const methodParam = searchParams.get('method');
    const endpointParam = searchParams.get('endpoint');
    if (catalogDeepLinkedRef.current || !catalogId || (!methodParam && !endpointParam)) return;
    catalogDeepLinkedRef.current = true;

    (async () => {
      try {
        const entries = await fetchCatalog();
        const entry = entries.find((e) => e.id === catalogId);
        const catalog = entry?.catalog as Record<string, unknown> | null | undefined;
        if (!entry || !catalog) return;

        const id = generateNodeId();
        let stepData: StepData | null = null;

        if (entry.protocol === 'grpc' && methodParam) {
          const methods = (catalog.methods ?? []) as ProtoMethodInfo[];
          const method = methods.find((m) => m.name === methodParam);
          if (method) {
            stepData = {
              stepId: id,
              name: method.name,
              type: 'grpcCall',
              config: grpcMethodToFullStepConfig(entry.id, method),
              extract: {},
              assertions: [],
            };
          }
        } else if (entry.protocol === 'rest' && endpointParam) {
          const [epMethod, ...pathParts] = endpointParam.split(' ');
          const epPath = pathParts.join(' ');
          const endpoints = (catalog.endpoints ?? []) as RestEndpointInfo[];
          const endpoint = endpoints.find((e) => e.method === epMethod && e.path === epPath);
          if (endpoint) {
            const service: RestServiceInfo = {
              id: entry.id,
              name: entry.name,
              domain: entry.domain,
              target: entry.target,
              endpoints,
            };
            stepData = {
              stepId: id,
              name: `${endpoint.method} ${endpoint.path}`,
              type: 'apiCall',
              config: restEndpointToStepConfig(service, endpoint),
              extract: {},
              assertions: [],
            };
          }
        }

        if (!stepData) return;
        const yPos = nodes.length * 120 + 50;
        const newNode: Node = { id, type: 'stepNode', position: { x: 250, y: yPos }, data: stepData };
        setNodes((nds) => [...nds, newNode]);
        setSelectedNode(id);
      } catch {
        // silently ignore — deep-link is best-effort
      }
    })();
    // Runs once on mount; nodes.length is only read to compute an initial position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Deep-link: CreateHub'tan gelen mod parametreleri.
  //   ?tab=yaml       → YAML editörünü aç
  //   ?ai=1           → AI chat panelini aç + odakla
  //   ?prompt=<metin> → AI chat'i açıp otomatik üret (tek hamle)
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current) return;
    const tab = searchParams.get('tab');
    const ai = searchParams.get('ai');
    const prompt = searchParams.get('prompt');
    if (!tab && !ai && !prompt) return;
    deepLinkedRef.current = true;
    if (tab === 'yaml') {
      setRightPanelOpen(true);
      setRightTab('yaml');
    } else if (prompt) {
      // Tek hamle: prompt'u göster ve otomatik üret (handleChatSubmit sağ paneli açar).
      setRightTab('ai');
      setChatPrompt(prompt);
      setTimeout(() => handleChatSubmit(prompt), 150);
    }
    // ?ai=1 (prompt'suz) → merkez kahraman zaten AI girişidir, panel açılmaz.
    // handleChatSubmit is stable within this mount; guarded to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Debug mode: load failed run and pre-fill AI chat with error context
  useEffect(() => {
    const debugRunId = searchParams.get('debug');
    if (!debugRunId || debugLoadedRef.current) return;
    debugLoadedRef.current = true;
    setDebugMode(true);

    (async () => {
      try {
        const run = await fetchRunDetail(debugRunId);
        // Load the test manifest into builder
        if (run.test_id) {
          await handleLoadTest(run.test_id);
        }
        // Store run detail for reference
        setRunDetail(run);
        setRunStatus(run.status as typeof runStatus);

        // Build debug context from failed steps
        const failedSteps = run.steps.filter((s) => s.status === 'failed' || s.status === 'error');
        const errorLines: string[] = [
          `Test "${run.manifest?.name ?? run.test_id}" failed.`,
        ];
        if (run.error) errorLines.push(`Run error: ${run.error}`);
        for (const step of failedSteps) {
          errorLines.push(`\nStep "${step.step_name}" (${step.step_type}) failed:`);
          if (step.error) errorLines.push(`  Error: ${step.error}`);
          if (step.assertions) {
            for (const a of step.assertions.filter((x) => !x.passed)) {
              errorLines.push(`  Assertion "${a.name}": expected=${JSON.stringify(a.expected)}, actual=${JSON.stringify(a.actual)}`);
            }
          }
        }

        // Pre-fill AI chat with debug prompt
        const debugPrompt = `Bu test run başarısız oldu. Hataları analiz et ve düzeltme öner:\n\n${errorLines.join('\n')}`;
        setChatPrompt(debugPrompt);
        // Switch to AI tab and open right panel
        setRightTab('ai');
        setSelectedNode(null);
      } catch (err) {
        console.error('Debug mode load failed:', err);
      }
    })();
  }, [searchParams]);

  /* ── Connection handling ── */

  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const targetNode = nodes.find((n) => n.id === connection.target);

      if (!sourceNode || !targetNode) {
        setEdges((eds) =>
          addEdge({ ...connection, animated: true, style: { stroke: '#6366f1' } }, eds),
        );
        return;
      }

      const sourceData = sourceNode.data as StepData;
      const hasExtracts = Object.keys(sourceData.extract).length > 0;

      if (hasExtracts) {
        setPendingConnection({ connection, sourceNode, targetNode });
      } else {
        setEdges((eds) =>
          addEdge({ ...connection, animated: true, style: { stroke: '#6366f1' } }, eds),
        );
      }
    },
    [nodes, setEdges],
  );

  const handleConnectionConfirm = useCallback(
    (mappings: Array<{ sourceKey: string; targetField: string }>) => {
      if (!pendingConnection) return;

      setEdges((eds) =>
        addEdge(
          { ...pendingConnection.connection, animated: true, style: { stroke: '#6366f1' } },
          eds,
        ),
      );

      if (mappings.length > 0) {
        const targetData = pendingConnection.targetNode.data as StepData;
        const currentMessage = (targetData.config.message as Record<string, unknown>) ?? {};
        const updatedMessage = { ...currentMessage };

        for (const mapping of mappings) {
          setNestedValue(updatedMessage, mapping.targetField, `{{extract.${mapping.sourceKey}}}`);
        }

        setNodes((nds) =>
          nds.map((n) =>
            n.id === pendingConnection.targetNode.id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    config: { ...(n.data as StepData).config, message: updatedMessage },
                  },
                }
              : n,
          ),
        );
      }

      setPendingConnection(null);
    },
    [pendingConnection, setEdges, setNodes],
  );

  const handleConnectionSkip = useCallback(() => {
    if (!pendingConnection) return;
    setEdges((eds) =>
      addEdge(
        { ...pendingConnection.connection, animated: true, style: { stroke: '#6366f1' } },
        eds,
      ),
    );
    setPendingConnection(null);
  }, [pendingConnection, setEdges]);

  /* ── Edge reconnect ── */

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) =>
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds)),
    [setEdges],
  );

  /* ── Node selection ── */

  const onNodeClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
    setSelectedNode(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setContextMenu(null);
  }, []);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: { id: string }) => {
      if (!cinemaEnabled) return;
      event.preventDefault();
      const idx = parseInt(node.id.replace('step-', ''), 10);
      const stepData = nodes.find((n) => n.id === node.id)?.data as StepData | undefined;
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        stepIndex: idx,
        stepName: stepData?.name ?? `Step ${idx}`,
      });
    },
    [cinemaEnabled, nodes],
  );

  /* ── Add / delete / update nodes ── */

  const addStep = useCallback(
    (type: string) => {
      const id = generateNodeId();
      const yPos = nodes.length * 120 + 50;
      const newNode = {
        id,
        type: 'stepNode',
        position: { x: 250, y: yPos },
        data: {
          stepId: id,
          name: `New ${type} Step`,
          type,
          config: {},
          extract: {},
          assertions: [],
        } as StepData,
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedNode(id);
    },
    [nodes.length, setNodes],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      if (selectedNode === nodeId) setSelectedNode(null);
    },
    [selectedNode, setNodes, setEdges],
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: Partial<StepData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)),
      );
    },
    [setNodes],
  );

  /* ── Derived data ── */

  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    const found = nodes.find((n) => n.id === selectedNode);
    if (!found) return null;
    return found as unknown as { id: string; data: StepData };
  }, [selectedNode, nodes]);

  const connectedExtracts = useMemo(() => {
    if (!selectedNode) return [];
    const incomingEdges = edges.filter((e) => e.target === selectedNode);
    const extracts: Array<{ stepName: string; key: string; path: string }> = [];
    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((n) => n.id === edge.source);
      if (!sourceNode) continue;
      const sourceData = sourceNode.data as StepData;
      for (const [key, path] of Object.entries(sourceData.extract)) {
        extracts.push({ stepName: sourceData.name, key, path });
      }
    }
    return extracts;
  }, [selectedNode, edges, nodes]);

  /* ── Save / Export ── */

  const handleSave = async () => {
    setSaving(true);
    try {
      const manifest = buildManifest();
      await saveManifest(manifest);
      alert('Test saved successfully!');
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleAISave = async () => {
    if (!currentYaml.trim()) return;
    setAISaving(true);
    setAISaveMsg(null);
    try {
      const result = await aiSave(currentYaml);
      setAISaveMsg({ ok: true, text: `${result.filename} kaydedildi` });
      setTimeout(() => setAISaveMsg(null), 4000);
    } catch (err) {
      setAISaveMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
      setTimeout(() => setAISaveMsg(null), 5000);
    } finally {
      setAISaving(false);
    }
  };

  const handleExport = async () => {
    try {
      const manifest = buildManifest();
      const yaml = await exportYaml(manifest);
      const blob = new Blob([yaml], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${testMeta.id || 'test'}.yaml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /* ── Run test ── */

  const stopPolling = useCallback(() => {
    if (runPollingRef.current) {
      clearInterval(runPollingRef.current);
      runPollingRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const applyRunResults = useCallback(
    (detail: RunDetail) => {
      setNodes((nds) =>
        nds.map((node) => {
          const stepData = node.data as StepData;
          const stepResult = detail.steps.find((s) => s.step_name === stepData.name);
          if (stepResult) {
            return {
              ...node,
              data: {
                ...node.data,
                runStatus: stepResult.status,
                runDurationMs: stepResult.duration_ms,
                runAssertions: stepResult.assertions,
                runError: stepResult.error,
              },
            };
          }
          return node;
        }),
      );
    },
    [setNodes],
  );

  const clearRunResults = useCallback(() => {
    setRunStatus('idle');
    setRunDetail(null);
    setRunError(null);
    setBottomPanelOpen(false);
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          runStatus: undefined,
          runDurationMs: undefined,
          runAssertions: undefined,
          runError: undefined,
        },
      })),
    );
  }, [setNodes]);

  const pollRunResult = useCallback(
    (runId: string) => {
      stopPolling();
      runPollingRef.current = setInterval(async () => {
        try {
          const detail = await fetchRunDetail(runId);
          setRunDetail(detail);
          applyRunResults(detail);

          if (detail.status === 'passed' || detail.status === 'failed' || detail.status === 'error') {
            stopPolling();
            setRunStatus(detail.status as 'passed' | 'failed' | 'error');
            setBottomPanelOpen(true);
            if (detail.status === 'failed' || detail.status === 'error') {
              setTimeout(() => {
                const failedEl = bottomPanelRef.current?.querySelector('[data-step-failed="true"]');
                failedEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }
          }
        } catch {
          stopPolling();
          setRunStatus('error');
          setRunError('Failed to fetch run results');
        }
      }, 1500);
    },
    [stopPolling, applyRunResults],
  );

  const handleRun = async () => {
    if (runStatus === 'running' || runStatus === 'saving') return;
    if (!testMeta.id) {
      alert('Test ID is required to run');
      return;
    }

    clearRunResults();
    setRunStatus('saving');

    try {
      const manifest = buildManifest();
      await saveManifest(manifest);
    } catch (err) {
      setRunError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
      setRunStatus('error');
      return;
    }

    setRunStatus('running');
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, runStatus: 'running' },
      })),
    );

    try {
      const res = await runSingleTest(testMeta.id, testMeta.mode, undefined, undefined, undefined, builderRunId) as { success: boolean; data: { id?: string; message?: string; test_id?: string } };
      const runId = res.data?.id ?? builderRunId;

      const resolvedRunId = runId || await (async () => {
        await new Promise((r) => setTimeout(r, 1000));
        const { runs } = await fetchRuns({ test_id: testMeta.id, limit: 1 });
        return runs[0]?.id ?? null;
      })();

      if (!resolvedRunId) {
        setRunStatus('error');
        setRunError('Could not find the started run');
        return;
      }

      if (cinemaEnabled) {
        // Cinema mode: use WebSocket for real-time events
        setCinemaRunId(resolvedRunId);
        cinemaControls.activate('live');
      } else {
        // Standard polling mode
        pollRunResult(resolvedRunId);
      }
    } catch (err) {
      setRunError(`Run failed: ${err instanceof Error ? err.message : String(err)}`);
      setRunStatus('error');
    }
  };

  /* ── Debug with AI ── */

  const handleDebugWithAI = async () => {
    if (!runDetail || chatLoading) return;

    const failedSteps = runDetail.steps.filter(
      (s) => s.status === 'failed' || s.status === 'error',
    );

    // Build detailed error context
    const lines: string[] = [];
    lines.push(`Test "${testMeta.name || runDetail.test_id}" — run ${runDetail.status}.`);
    if (runDetail.error) lines.push(`Run error: ${runDetail.error}`);

    for (const step of failedSteps) {
      lines.push(`\nStep "${step.step_name}" (${step.step_type}) — ${step.status}:`);
      if (step.error) lines.push(`  Error: ${step.error}`);
      if (step.assertions) {
        for (const a of step.assertions.filter((x) => !x.passed)) {
          lines.push(
            `  Assertion "${a.name}": expected=${JSON.stringify(a.expected)}, actual=${JSON.stringify(a.actual)}`,
          );
        }
      }
      if (step.response_summary) {
        const respStr = JSON.stringify(step.response_summary, null, 2);
        if (respStr.length < 1500) {
          lines.push(`  Response: ${respStr}`);
        }
      }
    }

    const debugPrompt =
      `Bu test run başarısız oldu. Hataları analiz et ve YAML'ı düzelt:\n\n${lines.join('\n')}`;

    // Open AI panel
    setRightPanelOpen(true);
    setRightTab('ai');
    setSelectedNode(null);

    // Add user message
    setChatMessages((prev) => [...prev, { role: 'user', content: debugPrompt }]);
    setChatLoading(true);

    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
      const model = selectedModel || undefined;

      const result = await aiRefine(currentYaml, debugPrompt, history, model, controller.signal);

      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.hasErrors
            ? 'Analiz tamamlandı, düzeltmeler uygulandı (validasyon uyarıları var):'
            : 'Hatalar analiz edildi ve YAML düzeltildi.',
          errors: result.validationErrors,
        },
      ]);

      // Apply fixed YAML
      syncSourceRef.current = 'ai';
      setCurrentYaml(result.yaml);
      setYamlError(null);

      if (result.manifest && typeof result.manifest === 'object') {
        applyManifest(result.manifest as Record<string, unknown>);
      } else {
        try {
          const parsed = yamlParse(result.yaml) as Record<string, unknown>;
          if (parsed && typeof parsed === 'object') {
            syncSourceRef.current = 'ai';
            applyManifest(parsed);
          }
        } catch {
          // yaml parse failed
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Durduruldu.' }]);
      } else {
        const errMsg = err instanceof Error ? err.message : String(err);
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Debug error: ${errMsg}` },
        ]);
      }
    } finally {
      if (chatAbortRef.current === controller) chatAbortRef.current = null;
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  };

  /* ── AI Chat ── */

  const isAIConfigured = aiStatus?.configured ?? false;

  const handleChatSubmit = async (promptOverride?: string) => {
    if (chatLoading) return;
    const override = typeof promptOverride === 'string' ? promptOverride : undefined;
    const userMsg = (override ?? chatPrompt).trim();
    if (!userMsg) return;
    // Chat başladı → merkez kahramandan sağ panel sohbetine geç.
    setRightPanelOpen(true);
    setRightTab('ai');
    setChatPrompt('');
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    const controller = new AbortController();
    chatAbortRef.current = controller;

    try {
      const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));

      const isRefine = !!currentYaml.trim();
      console.log(`[AI] ${isRefine ? 'Refining' : 'Generating'} - prompt: "${userMsg.slice(0, 100)}"...`);
      const t0 = Date.now();

      const model = selectedModel || undefined;
      let result;
      if (isRefine) {
        result = await aiRefine(currentYaml, userMsg, history, model, controller.signal);
      } else {
        result = await aiGenerate(userMsg, history, model, controller.signal);
      }

      console.log(`[AI] Response received in ${Date.now() - t0}ms - yaml: ${result.yaml.length} chars, errors: ${result.hasErrors}`);

      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.hasErrors
            ? 'Generated with validation warnings:'
            : 'Test manifest generated successfully.',
          errors: result.validationErrors,
        },
      ]);

      syncSourceRef.current = 'ai';
      setCurrentYaml(result.yaml);
      setYamlError(null);

      if (result.manifest && typeof result.manifest === 'object') {
        applyManifest(result.manifest as Record<string, unknown>);
      } else {
        try {
          const parsed = yamlParse(result.yaml) as Record<string, unknown>;
          if (parsed && typeof parsed === 'object') {
            syncSourceRef.current = 'ai';
            applyManifest(parsed);
          }
        } catch {
          // yaml parse failed, diagram won't update
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: 'Durduruldu.' }]);
      } else {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[AI] Error:`, errMsg);
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Error: ${errMsg}`,
          },
        ]);
      }
    } finally {
      if (chatAbortRef.current === controller) chatAbortRef.current = null;
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
  };

  /* ── YAML panel resize via drag ── */

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      dragStartY.current = e.clientY;
      dragStartHeight.current = yamlPanelHeight;
      e.preventDefault();

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = dragStartY.current - ev.clientY;
        setYamlPanelHeight(Math.max(80, Math.min(600, dragStartHeight.current + delta)));
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [yamlPanelHeight],
  );

  /* ── Bottom panel drag resize ── */
  const handleBottomDragStart = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      dragStartY.current = e.clientY;
      dragStartHeight.current = bottomPanelHeight;
      e.preventDefault();

      const onMove = (ev: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = dragStartY.current - ev.clientY;
        setBottomPanelHeight(Math.max(120, Math.min(500, dragStartHeight.current + delta)));
      };
      const onUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [bottomPanelHeight],
  );

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="flex flex-col h-screen">
      {/* ── Compact Toolbar ── */}
      <div className="relative z-30 flex-shrink-0 h-11 border-b border-slate-200 bg-white flex items-center px-3 gap-2">
        {debugMode && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 border border-amber-200 px-2 py-1 text-[10px] font-semibold text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            DEBUG MODE
          </span>
        )}

        {/* Inline metadata */}
        <input
          type="text" value={testMeta.id} placeholder="test-id"
          onChange={(e) => setTestMeta((m) => ({ ...m, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
          className="w-36 rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
        <input
          type="text" value={testMeta.name} placeholder="Test Name"
          onChange={(e) => setTestMeta((m) => ({ ...m, name: e.target.value }))}
          className="w-44 rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
        <input
          type="text" value={testMeta.tags} placeholder="e.g. smoke, api"
          onChange={(e) => setTestMeta((m) => ({ ...m, tags: e.target.value }))}
          className="w-28 rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />

        {/* Load Test */}
        <div className="relative" ref={loaderContainerRef}>
          <button
            onClick={() => setLoaderOpen(!loaderOpen)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              loaderOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Load
          </button>
          {loaderOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 w-96">
              <div className="rounded-lg border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center border-b border-slate-100">
                  <Search className="ml-3 h-4 w-4 text-slate-400" />
                  <input
                    ref={loaderInputRef}
                    type="text"
                    value={loaderQuery}
                    onChange={(e) => setLoaderQuery(e.target.value)}
                    placeholder="Search tests..."
                    className="flex-1 border-0 bg-transparent px-3 py-2.5 text-sm focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setLoaderOpen(false); setLoaderQuery(''); }
                      if (e.key === 'Enter' && filteredTests.length === 1) handleLoadTest(filteredTests[0].id);
                    }}
                  />
                  <button onClick={() => { setLoaderOpen(false); setLoaderQuery(''); }} className="px-3 text-slate-400 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {loaderLoading ? (
                    <div className="flex items-center justify-center py-6 gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      <span className="text-xs text-slate-500">Loading...</span>
                    </div>
                  ) : filteredTests.length === 0 ? (
                    <div className="py-6 text-xs text-slate-400 text-center">{loaderQuery ? 'No matches' : 'No tests'}</div>
                  ) : (
                    filteredTests.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleLoadTest(t.id)}
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0 group"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-slate-800 group-hover:text-indigo-700 truncate flex-1">{t.name}</span>
                          {t.tags?.[0] && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">{t.tags[0]}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{t.id}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Run status badge */}
        {runDetail && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
            runDetail.status === 'passed' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
            : runDetail.status === 'failed' ? 'bg-red-50 text-red-700 ring-red-200'
            : runDetail.status === 'running' ? 'bg-blue-50 text-blue-700 ring-blue-200'
            : 'bg-slate-50 text-slate-600 ring-slate-200'
          }`}>
            {runDetail.status === 'running' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}
            {runDetail.status === 'passed' && <CheckCircle2 className="inline h-3 w-3 mr-1" />}
            {runDetail.status === 'failed' && <XCircle className="inline h-3 w-3 mr-1" />}
            {runDetail.status}{runDetail.duration_ms != null && ` · ${runDetail.duration_ms}ms`}
          </span>
        )}
        {runError && (
          <span className="text-[10px] text-red-500 truncate max-w-32">{runError}</span>
        )}

        {/* Actions */}
        <button
          onClick={() => {
            setCinemaEnabled((v) => {
              if (v) cinemaControls.deactivate();
              return !v;
            });
          }}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            cinemaEnabled
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
          title="Watch runs live"
        >
          {cinemaEnabled && wsConnected
            ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
            : <Film className="h-3.5 w-3.5" />}
          Live
        </button>
        <button
          onClick={handleRun}
          disabled={runStatus === 'running' || runStatus === 'saving' || !testMeta.id || nodes.length === 0}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {runStatus === 'running' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          {runStatus === 'running' ? 'Running' : 'Run'}
        </button>
        <button
          onClick={handleSave} disabled={saving || !testMeta.id}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Save className="h-3 w-3" />
          Save
        </button>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <Download className="h-3 w-3" />
        </button>

        <div className="h-5 w-px bg-slate-200" />

        <button
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title={rightPanelOpen ? 'Close panel' : 'Open panel'}
        >
          {rightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </button>
      </div>

      {/* ── Main Area: Palette + Canvas + Right Panel ── */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Compact Step Palette */}
        <StepPalette onAddStep={addStep} />

        {/* Center: Canvas + Bottom Panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* ReactFlow Canvas */}
          <div className="flex-1 relative min-h-0" ref={reactFlowWrapper}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onNodeClick={onNodeClick}
              onNodeContextMenu={onNodeContextMenu}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
              className="bg-slate-50"
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
              <Controls className="!bg-white !border-slate-200 !shadow-sm !rounded-lg" />
            </ReactFlow>

            {nodes.length === 0 && chatMessages.length === 0 && !rightPanelOpen && isAIConfigured && (
              <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none">
                <div className="w-full max-w-lg text-center pointer-events-auto">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50">
                    <Sparkles className="h-5 w-5 text-indigo-600" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">What do you want to test?</h2>
                  <p className="mt-1 text-sm text-slate-500">Describe it in plain language — Studio generates a runnable test, then you watch it run live.</p>
                  <div className="mt-4 flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
                    <textarea
                      value={chatPrompt}
                      onChange={(e) => setChatPrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(); } }}
                      rows={3}
                      placeholder='e.g. Check that GET /health returns 200 and status is "ok"'
                      disabled={chatLoading}
                      className="min-h-[80px] flex-1 resize-y border-0 bg-transparent px-1 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    />
                    {chatLoading ? (
                      <button
                        onClick={handleChatStop}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3.5 text-[13px] font-semibold text-white shadow-sm hover:bg-red-700"
                      >
                        <Square className="h-3.5 w-3.5 fill-current" />
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={() => handleChatSubmit()}
                        disabled={!chatPrompt.trim()}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-[13px] font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Sparkles className="h-4 w-4" />
                        Generate
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-slate-400">or add steps from the left rail, or Load an existing test</p>
                </div>
              </div>
            )}

            {nodes.length === 0 && !rightPanelOpen && !isAIConfigured && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center space-y-2">
                  <div className="mx-auto h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Play className="h-5 w-5 text-slate-300" />
                  </div>
                  <p className="text-sm text-slate-400">Add steps from the left toolbar</p>
                  <p className="text-xs text-slate-300">or load an existing test</p>
                </div>
              </div>
            )}

            {/* Cinema Mode Overlay */}
            {cinemaEnabled && cinema.active && (
              <CinemaOverlay cinema={cinema} controls={cinemaControls} extractEdgeMap={extractEdgeMap} />
            )}

            {/* Context Menu for Cinema */}
            {contextMenu && (
              <NodeContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                stepIndex={contextMenu.stepIndex}
                stepName={contextMenu.stepName}
                onRerunFromHere={(fromStep) => {
                  if (runDetail?.id) {
                    import('@/lib/api').then(({ resumeRun }) => {
                      resumeRun(runDetail.id, fromStep).then(() => {
                        // Re-trigger cinema for the resumed run
                        if (cinemaEnabled) {
                          cinemaControls.reset();
                          cinemaControls.activate('live');
                        }
                      }).catch(() => {});
                    });
                  }
                }}
                onClose={() => setContextMenu(null)}
              />
            )}
          </div>

          {/* Bottom Run Results Panel */}
          {bottomPanelOpen && runDetail && (
            <div className="flex-shrink-0 border-t border-slate-200 bg-white flex flex-col" style={{ height: bottomPanelHeight }}>
              {/* Drag handle */}
              <div
                onMouseDown={handleBottomDragStart}
                className="h-1.5 cursor-row-resize bg-slate-100 hover:bg-indigo-200 transition-colors flex items-center justify-center"
              >
                <GripHorizontal className="h-3 w-3 text-slate-300" />
              </div>

              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50/80">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Run Results</span>
                  <StatusBadge status={runDetail.status} size="xs" />
                  {runDetail.duration_ms != null && (
                    <span className="text-[11px] font-mono text-slate-500">{formatDuration(runDetail.duration_ms)}</span>
                  )}
                  <span className="text-[10px] text-slate-400">
                    {runDetail.steps.filter((s) => s.status === 'passed').length}/{runDetail.steps.length} passed
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {(runDetail.status === 'failed' || runDetail.status === 'error') && isAIConfigured && (
                    chatLoading ? (
                      <button
                        onClick={handleChatStop}
                        className="inline-flex items-center gap-1 rounded-md bg-red-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-red-600 transition-colors"
                      >
                        <Square className="h-3 w-3 fill-current" />
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={handleDebugWithAI}
                        className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-amber-600 transition-colors"
                      >
                        <Bug className="h-3 w-3" />
                        AI Debug
                      </button>
                    )
                  )}
                  <a href={`/runs/${runDetail.id}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100 hover:text-indigo-600">
                    <ExternalLink className="h-3 w-3" />Full Detail
                  </a>
                  {(runDetail.status === 'passed' || runDetail.status === 'failed' || runDetail.status === 'error') && (
                    <button onClick={clearRunResults} className="rounded px-2 py-0.5 text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600">Clear</button>
                  )}
                  <button onClick={() => setBottomPanelOpen(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Step cards */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" ref={bottomPanelRef}>
                {runDetail.steps.map((step, idx) => (
                  <div key={step.id} data-step-failed={step.status === 'failed' || step.status === 'error' ? 'true' : undefined}>
                    <StepCard step={step} index={idx} />
                  </div>
                ))}
                {runDetail.artifacts.some((a) => a.type === 'screenshot') && (
                  <div className="pt-1">
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Screenshots</div>
                    <div className="grid grid-cols-2 gap-2">
                      {runDetail.artifacts.filter((a) => a.type === 'screenshot').map((a) => (
                        <figure key={a.id} className="overflow-hidden rounded-lg border border-slate-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`data:image/png;base64,${a.value}`} alt={a.key} className="block w-full" />
                          <figcaption className="truncate px-2 py-1 text-[10px] text-slate-500">{a.key}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Collapsed bottom bar when panel is closed but run exists */}
          {!bottomPanelOpen && runDetail && runDetail.steps.length > 0 && (
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-1.5 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setBottomPanelOpen(true)}
                className="flex items-center gap-3 hover:bg-slate-100 rounded px-1 py-0.5 transition-colors"
              >
                <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Run Results</span>
                <StatusBadge status={runDetail.status} size="xs" />
                <span className="text-[10px] text-slate-400">
                  {runDetail.steps.filter((s) => s.status === 'passed').length}/{runDetail.steps.length} passed
                </span>
                {runDetail.duration_ms != null && (
                  <span className="text-[10px] font-mono text-slate-400">{formatDuration(runDetail.duration_ms)}</span>
                )}
              </button>
              {(runDetail.status === 'failed' || runDetail.status === 'error') && isAIConfigured && (
                <button
                  onClick={handleDebugWithAI}
                  disabled={chatLoading}
                  className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  {chatLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bug className="h-3 w-3" />}
                  AI Debug
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Panel (collapsible) */}
        {rightPanelOpen && (
          selectedNodeData ? (
            <StepConfigPanel
              node={selectedNodeData}
              onUpdate={(data) => updateNodeData(selectedNodeData.id, data)}
              onDelete={() => deleteNode(selectedNodeData.id)}
              protoServices={protoServices}
              restServices={restServices}
              connectedExtracts={connectedExtracts}
            />
          ) : (
            <div className="w-96 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col">
              {/* Tab switcher */}
              <div className="flex-shrink-0 flex border-b border-slate-200">
                <button
                  onClick={() => setRightTab('ai')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                    rightTab === 'ai'
                      ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  AI Chat
                </button>
                <button
                  onClick={() => setRightTab('yaml')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                    rightTab === 'yaml'
                      ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/30'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  YAML
                  {yamlError && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                </button>
              </div>

              {/* AI Tab */}
              {rightTab === 'ai' && (
                <>
                  {/* Model picker */}
                  {isAIConfigured && (
                    <div className="flex-shrink-0 px-3 py-2 border-b border-slate-100">
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      >
                        <optgroup label="Claude">
                          <option value="claude-opus-4-8">claude-opus-4-8</option>
                          <option value="claude-sonnet-5">claude-sonnet-5</option>
                          <option value="claude-haiku-4-5">claude-haiku-4-5</option>
                        </optgroup>
                        <optgroup label="OpenAI">
                          <option value="gpt-4o">gpt-4o</option>
                          <option value="gpt-4o-mini">gpt-4o-mini</option>
                        </optgroup>
                      </select>
                    </div>
                  )}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {chatMessages.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full text-center px-3">
                        <Sparkles className="h-7 w-7 text-indigo-200 mb-2" />
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          {currentYaml.trim()
                            ? <><span className="font-medium text-indigo-500">{testMeta.id || 'Script'}</span> yüklü. Değişiklik iste veya soru sor.</>
                            : 'Test senaryonu anlat, AI manifest üretsin.'}
                        </p>
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[88%] rounded-lg px-2.5 py-1.5 text-[11px] leading-relaxed ${
                          msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          {msg.errors && msg.errors.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {msg.errors.map((err, j) => (
                                <div key={j} className="flex items-start gap-1 text-[9px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
                                  <AlertTriangle className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />{err}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="rounded-lg bg-slate-100 px-2.5 py-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <Loader2 className="h-3 w-3 animate-spin" />Generating...
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat input */}
                  <div className="flex-shrink-0 border-t border-slate-100 p-2">
                    <div className="flex items-end gap-1.5">
                      <textarea
                        ref={chatInputRef}
                        value={chatPrompt}
                        onChange={(e) => setChatPrompt(e.target.value)}
                        onKeyDown={handleChatKeyDown}
                        placeholder={currentYaml ? '"add a balance check..."' : 'Describe your test...'}
                        rows={2}
                        disabled={!isAIConfigured || chatLoading}
                        className="flex-1 resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                      />
                      {chatLoading ? (
                        <button
                          onClick={handleChatStop}
                          title="Durdur"
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white hover:bg-red-700 flex-shrink-0"
                        >
                          <Square className="h-3 w-3 fill-current" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleChatSubmit()}
                          disabled={!chatPrompt.trim() || !isAIConfigured}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 flex-shrink-0"
                        >
                          <Send className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {!isAIConfigured && <p className="mt-1 text-[9px] text-red-500">Set AI_API_KEY in .env</p>}
                  </div>
                </>
              )}

              {/* YAML Tab */}
              {rightTab === 'yaml' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      {yamlError && (
                        <span className="text-[9px] text-red-500 flex items-center gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" />{yamlError}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {aiSaveMsg && (
                        <span className={`text-[9px] ${aiSaveMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{aiSaveMsg.text}</span>
                      )}
                      {currentYaml.trim() && (
                        <button
                          onClick={handleAISave} disabled={aiSaving}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {aiSaving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Save className="h-2.5 w-2.5" />}
                          Save
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={currentYaml}
                    onChange={(e) => handleYamlChange(e.target.value)}
                    spellCheck={false}
                    className="flex-1 w-full resize-none bg-slate-50 px-3 py-2 text-[11px] font-mono text-slate-700 leading-relaxed focus:outline-none focus:bg-white"
                  />
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* ── Connection Mapper Dialog ── */}
      {pendingConnection &&
        (() => {
          const sourceData = pendingConnection.sourceNode.data as StepData;
          const targetData = pendingConnection.targetNode.data as StepData;
          const targetService = protoServices.find(
            (s) => s.fqn === targetData.config.service,
          );
          const targetMethod = targetService?.methods?.find(
            (m) => m.name === targetData.config.rpcMethod,
          );
          return (
            <ConnectionMapperDialog
              sourceName={sourceData.name}
              targetName={targetData.name}
              targetType={targetData.type}
              sourceExtracts={sourceData.extract}
              targetRequestFields={targetMethod?.requestFields ?? []}
              onConfirm={handleConnectionConfirm}
              onSkip={handleConnectionSkip}
            />
          );
        })()}
    </div>
  );
}

/* ================================================================== */
/*  Page wrapper                                                       */
/* ================================================================== */

export default function BuilderPage() {
  return (
    <ReactFlowProvider>
      <BuilderContent />
    </ReactFlowProvider>
  );
}
