import React, { useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Activity,
  Calculator,
  Download,
  Link2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Unlink,
} from 'lucide-react';

type SimMode =
  | 'spring'
  | 'metre_bridge'
  | 'prism'
  | 'moments'
  | 'cooling'
  | 'pendulum'
  | 'projectile'
  | 'circuit'
  | 'interference'
  | 'custom_bench';

interface InstrumentDef {
  type: string;
  label: string;
  category: 'Mechanics' | 'Electricity' | 'Optics & Heat';
  shortCode: string;
}

interface PlacedInstrument {
  id: string;
  type: string;
  label: string;
  category: 'Mechanics' | 'Electricity' | 'Optics & Heat';
  x: number;
  y: number;
}

interface WireConnection {
  id: string;
  fromId: string;
  toId: string;
}

interface PracticalReading {
  id: string;
  trial: number;
  xLabel: string;
  xValue: number;
  yLabel: string;
  yValue: number;
  notes: string;
}

const INSTRUMENTS_PALETTE: InstrumentDef[] = [
  { type: 'retort_stand', label: 'Retort Stand & Clamp', category: 'Mechanics', shortCode: 'RS' },
  { type: 'pendulum_bob', label: 'Pendulum Bob & Thread', category: 'Mechanics', shortCode: 'PB' },
  { type: 'spiral_spring', label: 'Spiral Spring', category: 'Mechanics', shortCode: 'SP' },
  { type: 'slotted_mass', label: 'Slotted Masses (m)', category: 'Mechanics', shortCode: 'SM' },
  { type: 'meter_rule', label: 'Metre Rule (100 cm)', category: 'Mechanics', shortCode: 'MR' },
  { type: 'knife_edge', label: 'Knife Edge Fulcrum', category: 'Mechanics', shortCode: 'KE' },
  { type: 'stopwatch', label: 'Digital Stopwatch', category: 'Mechanics', shortCode: 'SW' },
  { type: 'dc_cell', label: 'DC Cell / Power Supply', category: 'Electricity', shortCode: 'DC' },
  { type: 'plug_key', label: 'Switch / Plug Key', category: 'Electricity', shortCode: 'KY' },
  { type: 'rheostat', label: 'Variable Rheostat', category: 'Electricity', shortCode: 'RH' },
  { type: 'std_resistor', label: 'Standard Resistor (R)', category: 'Electricity', shortCode: 'R0' },
  { type: 'unknown_resistor', label: 'Unknown Resistor (X)', category: 'Electricity', shortCode: 'RX' },
  { type: 'metre_bridge', label: 'Metre Bridge Wire', category: 'Electricity', shortCode: 'MB' },
  { type: 'ammeter', label: 'Ammeter (0-3 A)', category: 'Electricity', shortCode: 'AM' },
  { type: 'voltmeter', label: 'Voltmeter (0-5 V)', category: 'Electricity', shortCode: 'VM' },
  { type: 'galvanometer', label: 'Centre-Zero Galvanometer', category: 'Electricity', shortCode: 'GV' },
  { type: 'glass_prism', label: '60° Glass Prism', category: 'Optics & Heat', shortCode: 'PR' },
  { type: 'optical_pins', label: 'Optical Pins & Ray Box', category: 'Optics & Heat', shortCode: 'OP' },
  { type: 'calorimeter', label: 'Calorimeter & Thermometer', category: 'Optics & Heat', shortCode: 'CL' },
];

interface PracticalPreset {
  id: string;
  paperCode: string;
  title: string;
  aim: string;
  xLabel: string;
  yLabel: string;
  nodes: Array<{ id: string; type: string; x: number; y: number }>;
  wires: Array<[string, string]>;
}

const ACSEE_PRACTICAL_PRESETS: PracticalPreset[] = [
  {
    id: 'acsee-spring',
    paperCode: 'ACSEE 131/3A Q1',
    title: 'Spiral Spring SHM & Hooke’s Law',
    aim: 'Determine spring constant k and acceleration due to gravity g by oscillating slotted masses m and plotting T² against m.',
    xLabel: 'Mass m (kg)',
    yLabel: 'Period² T² (s²)',
    nodes: [
      { id: 'n1', type: 'retort_stand', x: 110, y: 75 },
      { id: 'n2', type: 'spiral_spring', x: 260, y: 85 },
      { id: 'n3', type: 'slotted_mass', x: 260, y: 205 },
      { id: 'n4', type: 'meter_rule', x: 430, y: 120 },
      { id: 'n5', type: 'stopwatch', x: 430, y: 245 },
    ],
    wires: [
      ['n1', 'n2'],
      ['n2', 'n3'],
      ['n3', 'n4'],
      ['n3', 'n5'],
    ],
  },
  {
    id: 'acsee-bridge',
    paperCode: 'ACSEE 131/3B Q3',
    title: 'Metre Bridge Unknown Resistance (X)',
    aim: 'Connect DC cell, key, standard resistor R, unknown resistor X, galvanometer, and metre bridge to locate null deflection l₁.',
    xLabel: 'Standard R (Ω)',
    yLabel: 'Balance l₁ (cm)',
    nodes: [
      { id: 'b1', type: 'dc_cell', x: 95, y: 70 },
      { id: 'b2', type: 'plug_key', x: 245, y: 70 },
      { id: 'b3', type: 'ammeter', x: 395, y: 70 },
      { id: 'b4', type: 'std_resistor', x: 130, y: 175 },
      { id: 'b5', type: 'unknown_resistor', x: 370, y: 175 },
      { id: 'b6', type: 'metre_bridge', x: 250, y: 275 },
      { id: 'b7', type: 'galvanometer', x: 250, y: 175 },
    ],
    wires: [
      ['b1', 'b2'],
      ['b2', 'b3'],
      ['b3', 'b5'],
      ['b1', 'b4'],
      ['b4', 'b6'],
      ['b5', 'b6'],
      ['b4', 'b7'],
      ['b7', 'b6'],
    ],
  },
  {
    id: 'acsee-prism',
    paperCode: 'ACSEE 131/3A Q2',
    title: '60° Glass Prism Minimum Deviation',
    aim: 'Trace incident and emergent rays through a 60° equilateral prism using optical pins to determine minimum deviation D_m and refractive index n.',
    xLabel: 'Incidence i (°)',
    yLabel: 'Deviation D (°)',
    nodes: [
      { id: 'p1', type: 'optical_pins', x: 120, y: 150 },
      { id: 'p2', type: 'glass_prism', x: 280, y: 150 },
      { id: 'p3', type: 'meter_rule', x: 440, y: 150 },
    ],
    wires: [
      ['p1', 'p2'],
      ['p2', 'p3'],
    ],
  },
  {
    id: 'acsee-moments',
    paperCode: 'ACSEE 131/3C Q1',
    title: 'Principle of Moments & Mass of Metre Rule',
    aim: 'Balance a uniform metre rule on a knife-edge fulcrum with slotted masses to verify Στ_cw = Στ_acw.',
    xLabel: 'Distance d₁ (cm)',
    yLabel: 'Distance d₂ (cm)',
    nodes: [
      { id: 'm1', type: 'knife_edge', x: 275, y: 220 },
      { id: 'm2', type: 'meter_rule', x: 275, y: 135 },
      { id: 'm3', type: 'slotted_mass', x: 120, y: 135 },
      { id: 'm4', type: 'slotted_mass', x: 430, y: 135 },
    ],
    wires: [
      ['m1', 'm2'],
      ['m3', 'm2'],
      ['m4', 'm2'],
    ],
  },
  {
    id: 'acsee-cooling',
    paperCode: 'ACSEE 131/3C Q2',
    title: 'Newton’s Law of Cooling (Calorimetry)',
    aim: 'Measure cooling temperature θ over time t in a lagged calorimeter to evaluate cooling constant k.',
    xLabel: 'Time t (min)',
    yLabel: 'Temp θ (°C)',
    nodes: [
      { id: 'c1', type: 'calorimeter', x: 185, y: 155 },
      { id: 'c2', type: 'stopwatch', x: 375, y: 155 },
    ],
    wires: [['c1', 'c2']],
  },
];

const PHYSICS_CONSTANTS: Array<{ label: string; value: string; unit: string }> = [
  { label: 'g', value: '9.81', unit: 'm/s²' },
  { label: 'c', value: '299792458', unit: 'm/s' },
  { label: 'h', value: '6.626e-34', unit: 'J·s' },
  { label: 'G', value: '6.674e-11', unit: 'N·m²/kg²' },
  { label: 'e', value: '1.602e-19', unit: 'C' },
  { label: 'N_A', value: '6.022e23', unit: 'mol⁻¹' },
];

export const PhysicsLabTools: React.FC = () => {
  const [subTab, setSubTab] = useState<'custom' | 'emulation' | 'calculator'>('custom');

  // --- Custom Apparatus & ACSEE Practicals State ---
  const [activePresetId, setActivePresetId] = useState<string>('acsee-bridge');
  const [placedNodes, setPlacedNodes] = useState<PlacedInstrument[]>(() =>
    ACSEE_PRACTICAL_PRESETS[1].nodes.map((n) => {
      const def = INSTRUMENTS_PALETTE.find((d) => d.type === n.type)!;
      return { id: n.id, type: def.type, label: def.label, category: def.category, x: n.x, y: n.y };
    })
  );
  const [wires, setWires] = useState<WireConnection[]>(() =>
    ACSEE_PRACTICAL_PRESETS[1].wires.map(([a, b], i) => ({ id: `w-${i}`, fromId: a, toId: b }))
  );
  const [connectMode, setConnectMode] = useState(false);
  const [connectFromId, setConnectFromId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const benchRef = useRef<HTMLDivElement | null>(null);

  // Adjustable instrument dials shared between Workbench & Live Emulation
  const [customTitle, setCustomTitle] = useState('ACSEE 131/3B — Metre Bridge Unknown Resistance');
  const [benchMassKg, setBenchMassKg] = useState(0.15);
  const [benchSpringK, setBenchSpringK] = useState(25);
  const [benchEmfV, setBenchEmfV] = useState(4.0);
  const [benchStdR, setBenchStdR] = useState(5.0);
  const [benchUnknownX, setBenchUnknownX] = useState(7.5);
  const [benchRheostatR, setBenchRheostatR] = useState(2.0);
  const [benchJockeyCm, setBenchJockeyCm] = useState(40.0);
  const [benchIncidenceDeg, setBenchIncidenceDeg] = useState(48);
  const [benchRefractiveN, setBenchRefractiveN] = useState(1.52);
  const [benchMomentDistCm, setBenchMomentDistCm] = useState(24);
  const [benchMomentRightMassKg, setBenchMomentRightMassKg] = useState(0.10);
  const [benchMomentRightDistCm, setBenchMomentRightDistCm] = useState(36);
  const [benchCoolTimeMin, setBenchCoolTimeMin] = useState(4);
  const [benchCoolConstantK, setBenchCoolConstantK] = useState(0.085);

  const [readings, setReadings] = useState<PracticalReading[]>([]);

  const presetToSimMode = (presetId: string): SimMode => {
    switch (presetId) {
      case 'acsee-spring':
        return 'spring';
      case 'acsee-bridge':
        return 'metre_bridge';
      case 'acsee-prism':
        return 'prism';
      case 'acsee-moments':
        return 'moments';
      case 'acsee-cooling':
        return 'cooling';
      default:
        return 'custom_bench';
    }
  };

  const loadPreset = (preset: PracticalPreset) => {
    setActivePresetId(preset.id);
    setCustomTitle(`${preset.paperCode} — ${preset.title}`);
    setPlacedNodes(
      preset.nodes.map((n) => {
        const def = INSTRUMENTS_PALETTE.find((d) => d.type === n.type)!;
        return { id: n.id, type: def.type, label: def.label, category: def.category, x: n.x, y: n.y };
      })
    );
    setWires(preset.wires.map(([a, b], i) => ({ id: `w-${Date.now()}-${i}`, fromId: a, toId: b })));
    setReadings([]);
    setConnectFromId(null);
    setSimMode(presetToSimMode(preset.id));
  };

  const clearToBlankBench = () => {
    setActivePresetId('custom-blank');
    setCustomTitle('Custom Student Practical Apparatus Setup');
    setPlacedNodes([]);
    setWires([]);
    setReadings([]);
    setConnectFromId(null);
  };

  const addInstrumentToBench = (def: InstrumentDef) => {
    const idx = placedNodes.length;
    const x = 90 + ((idx * 95) % 420);
    const y = 75 + (Math.floor((idx * 95) / 420) * 95) % 210;
    setPlacedNodes((prev) => [
      ...prev,
      {
        id: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        type: def.type,
        label: def.label,
        category: def.category,
        x,
        y,
      },
    ]);
  };

  const removeInstrument = (id: string) => {
    setPlacedNodes((prev) => prev.filter((n) => n.id !== id));
    setWires((prev) => prev.filter((w) => w.fromId !== id && w.toId !== id));
    if (connectFromId === id) setConnectFromId(null);
  };

  const handleNodeClick = (id: string) => {
    if (!connectMode) return;
    if (!connectFromId) {
      setConnectFromId(id);
      return;
    }
    if (connectFromId === id) {
      setConnectFromId(null);
      return;
    }
    const duplicate = wires.some(
      (w) =>
        (w.fromId === connectFromId && w.toId === id) ||
        (w.fromId === id && w.toId === connectFromId)
    );
    if (!duplicate) {
      setWires((prev) => [...prev, { id: `w-${Date.now()}`, fromId: connectFromId, toId: id }]);
    }
    setConnectFromId(null);
  };

  const handleBenchPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingId || !benchRef.current) return;
    const rect = benchRef.current.getBoundingClientRect();
    const x = Math.max(55, Math.min(rect.width - 55, e.clientX - rect.left));
    const y = Math.max(35, Math.min(rect.height - 35, e.clientY - rect.top));
    setPlacedNodes((prev) => prev.map((n) => (n.id === draggingId ? { ...n, x, y } : n)));
  };

  // Determine which physics domains are connected on the user's custom bench
  const connectedTypes = useMemo(() => {
    const connectedIds = new Set<string>();
    wires.forEach((w) => {
      connectedIds.add(w.fromId);
      connectedIds.add(w.toId);
    });
    const set = new Set<string>();
    placedNodes.forEach((n) => {
      if (connectedIds.has(n.id)) set.add(n.type);
    });
    return set;
  }, [placedNodes, wires]);

  const hasElectricCircuit =
    connectedTypes.has('dc_cell') &&
    (connectedTypes.has('std_resistor') ||
      connectedTypes.has('unknown_resistor') ||
      connectedTypes.has('rheostat') ||
      connectedTypes.has('metre_bridge') ||
      connectedTypes.has('ammeter'));
  const hasSpringOrPendulum =
    connectedTypes.has('spiral_spring') || connectedTypes.has('pendulum_bob');
  const hasOptics = connectedTypes.has('glass_prism') && connectedTypes.has('optical_pins');
  const hasMoments = connectedTypes.has('knife_edge') && connectedTypes.has('meter_rule');
  const hasCalorimetry = connectedTypes.has('calorimeter');

  // Computed live physics readings for any connected instruments
  const elecTotalR =
    (connectedTypes.has('std_resistor') ? benchStdR : 0) +
    (connectedTypes.has('unknown_resistor') ? benchUnknownX : 0) +
    (connectedTypes.has('rheostat') ? benchRheostatR : 0);
  const elecCurrentA = hasElectricCircuit ? benchEmfV / Math.max(0.5, elecTotalR) : 0;
  const elecVoltDropV = elecCurrentA * benchStdR;
  const bridgeNullCm = (100 * benchStdR) / Math.max(0.1, benchStdR + benchUnknownX);
  const galvDeflectionMa = (benchJockeyCm - bridgeNullCm) * 0.45;

  const springExtCm = ((benchMassKg * 9.81) / benchSpringK) * 100;
  const springPeriodS = 2 * Math.PI * Math.sqrt(benchMassKg / benchSpringK);
  const springPeriodSq = springPeriodS * springPeriodS;

  const prismApex = 60;
  const iRad = (benchIncidenceDeg * Math.PI) / 180;
  const r1Rad = Math.asin(Math.sin(iRad) / benchRefractiveN);
  const r2Rad = (prismApex * Math.PI) / 180 - r1Rad;
  const sinE = benchRefractiveN * Math.sin(r2Rad);
  const emergentDeg = Math.abs(sinE) <= 1 ? (Math.asin(sinE) * 180) / Math.PI : NaN;
  const deviationDeg = !Number.isNaN(emergentDeg) ? benchIncidenceDeg + emergentDeg - prismApex : NaN;

  const torqueLeft = benchMassKg * 9.81 * (benchMomentDistCm / 100);
  const torqueRight = benchMomentRightMassKg * 9.81 * (benchMomentRightDistCm / 100);
  const requiredRightDistCm = (benchMassKg * benchMomentDistCm) / Math.max(0.05, benchMomentRightMassKg);

  const coolingTempC = 25 + (85 - 25) * Math.exp(-benchCoolConstantK * benchCoolTimeMin);

  const recordCurrentReading = (modeOverride?: SimMode) => {
    const trial = readings.length + 1;
    let xLabel = 'Input X';
    let xValue = trial;
    let yLabel = 'Output Y';
    let yValue = 0;
    let notes = '';

    const mode = modeOverride || (subTab === 'emulation' ? simMode : undefined);

    if (mode === 'metre_bridge' || (!mode && hasElectricCircuit && connectedTypes.has('metre_bridge'))) {
      xLabel = 'R (Ω)';
      xValue = benchStdR;
      yLabel = 'l₁ (cm)';
      yValue = Number(bridgeNullCm.toFixed(2));
      notes = `I=${elecCurrentA.toFixed(2)}A, X=${benchUnknownX}Ω`;
    } else if (mode === 'circuit' || (!mode && hasElectricCircuit)) {
      xLabel = 'EMF (V)';
      xValue = mode === 'circuit' ? voltage : benchEmfV;
      yLabel = 'Current I (A)';
      yValue = Number((mode === 'circuit' ? voltage / Math.max(0.1, circuitType === 'series' ? r1 + r2 : (r1 * r2) / (r1 + r2)) : elecCurrentA).toFixed(3));
      notes = mode === 'circuit' ? `${circuitType} R1=${r1}Ω, R2=${r2}Ω` : `R_total=${elecTotalR.toFixed(1)}Ω`;
    } else if (mode === 'spring' || (!mode && hasSpringOrPendulum)) {
      xLabel = 'Mass m (kg)';
      xValue = benchMassKg;
      yLabel = 'T² (s²)';
      yValue = Number(springPeriodSq.toFixed(3));
      notes = `e=${springExtCm.toFixed(1)}cm, T=${springPeriodS.toFixed(2)}s`;
    } else if (mode === 'pendulum') {
      const pT = 2 * Math.PI * Math.sqrt(pendLength / gravity);
      xLabel = 'Length L (m)';
      xValue = pendLength;
      yLabel = 'T² (s²)';
      yValue = Number((pT * pT).toFixed(3));
      notes = `g=${gravity.toFixed(2)}m/s², T=${pT.toFixed(2)}s`;
    } else if (mode === 'prism' || (!mode && hasOptics)) {
      xLabel = 'Incidence i (°)';
      xValue = benchIncidenceDeg;
      yLabel = 'Deviation D (°)';
      yValue = Number.isNaN(deviationDeg) ? 0 : Number(deviationDeg.toFixed(2));
      notes = Number.isNaN(deviationDeg) ? 'TIR occurred' : `n=${benchRefractiveN}, e=${emergentDeg.toFixed(1)}°`;
    } else if (mode === 'moments' || (!mode && hasMoments)) {
      xLabel = 'd₁ (cm)';
      xValue = benchMomentDistCm;
      yLabel = 'd₂ (cm)';
      yValue = Number(requiredRightDistCm.toFixed(2));
      notes = `τ_L=${torqueLeft.toFixed(3)} N·m, τ_R=${torqueRight.toFixed(3)} N·m`;
    } else if (mode === 'cooling' || (!mode && hasCalorimetry)) {
      xLabel = 'Time t (min)';
      xValue = benchCoolTimeMin;
      yLabel = 'Temp θ (°C)';
      yValue = Number(coolingTempC.toFixed(2));
      notes = `k=${benchCoolConstantK.toFixed(3)} min⁻¹, Ambient 25°C`;
    } else {
      notes = `${placedNodes.length} instruments, ${wires.length} links`;
    }

    setReadings((prev) => [
      ...prev,
      { id: `rd-${Date.now()}`, trial, xLabel, xValue, yLabel, yValue, notes },
    ]);
  };

  // Linear regression slope & intercept on recorded readings
  const regression = useMemo(() => {
    if (readings.length < 2) return null;
    const n = readings.length;
    const sumX = readings.reduce((s, r) => s + r.xValue, 0);
    const sumY = readings.reduce((s, r) => s + r.yValue, 0);
    const sumXY = readings.reduce((s, r) => s + r.xValue * r.yValue, 0);
    const sumX2 = readings.reduce((s, r) => s + r.xValue * r.xValue, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-9) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
  }, [readings]);

  const exportPracticalReportPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`ELIMU FASTA — ACSEE PRACTICAL REPORT`, 44, 52);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(customTitle, 44, 74);
    doc.text(`Instruments Connected (${placedNodes.length}): ${placedNodes.map((n) => n.label).join(', ')}`, 44, 96, {
      maxWidth: 500,
    });
    let y = 140;
    doc.setFont('helvetica', 'bold');
    doc.text('Observation Table:', 44, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    readings.forEach((r) => {
      doc.text(`#${r.trial}  |  ${r.xLabel}: ${r.xValue}  |  ${r.yLabel}: ${r.yValue}  |  ${r.notes}`, 44, y);
      y += 16;
    });
    if (regression) {
      y += 12;
      doc.setFont('helvetica', 'bold');
      doc.text(
        `Calculated Gradient (Slope): ${regression.slope.toFixed(4)}  |  Y-Intercept: ${regression.intercept.toFixed(4)}`,
        44,
        y
      );
    }
    doc.save('ACSEE_Practical_Report.pdf');
  };

  // --- Physics Emulation State ---
  const [simMode, setSimMode] = useState<SimMode>('spring');
  const [isPlaying, setIsPlaying] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [pendLength, setPendLength] = useState(1.5);
  const [gravity, setGravity] = useState(9.81);
  const [pendAngleDeg, setPendAngleDeg] = useState(25);

  const [projSpeed, setProjSpeed] = useState(35);
  const [projAngleDeg, setProjAngleDeg] = useState(45);

  const [voltage, setVoltage] = useState(12);
  const [r1, setR1] = useState(4);
  const [r2, setR2] = useState(6);
  const [circuitType, setCircuitType] = useState<'series' | 'parallel'>('series');

  const [wavelengthNm, setWavelengthNm] = useState(550);
  const [slitSepMm, setSlitSepMm] = useState(0.4);
  const [screenDistM, setScreenDistM] = useState(1.5);

  const simTimeRef = useRef(0);

  useEffect(() => {
    if (subTab !== 'emulation') return;
    let rafId = 0;
    let lastTs = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      if (isPlaying) simTimeRef.current += dt;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, w, h);

          ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
          ctx.lineWidth = 1;
          for (let gx = 40; gx < w; gx += 40) {
            ctx.beginPath();
            ctx.moveTo(gx, 0);
            ctx.lineTo(gx, h);
            ctx.stroke();
          }
          for (let gy = 40; gy < h; gy += 40) {
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.lineTo(w, gy);
            ctx.stroke();
          }

          const t = simTimeRef.current;

          if (simMode === 'spring') {
            // ACSEE 131/3A Q1: Spiral Spring SHM & Hooke's Law
            const omega = Math.sqrt(benchSpringK / benchMassKg);
            const staticExtPx = Math.min(115, ((benchMassKg * 9.81) / benchSpringK) * 420);
            const ampPx = 28;
            const oscY = ampPx * Math.cos(omega * t);
            const anchorX = w / 2 - 40;
            const topY = 48;
            const naturalBottomY = 128;
            const massTopY = naturalBottomY + staticExtPx + oscY;

            // Retort stand base & clamp arm
            ctx.fillStyle = '#475569';
            ctx.fillRect(anchorX - 135, h - 42, 130, 14);
            ctx.fillRect(anchorX - 110, 32, 10, h - 74);
            ctx.fillRect(anchorX - 110, topY - 10, 120, 10);

            // Metre rule alongside spring
            const ruleX = anchorX + 86;
            ctx.fillStyle = '#eab308';
            ctx.fillRect(ruleX, 50, 28, h - 92);
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1;
            for (let cm = 0; cm <= 30; cm++) {
              const ry = 60 + cm * 10;
              const tickW = cm % 5 === 0 ? 12 : 6;
              ctx.beginPath();
              ctx.moveTo(ruleX, ry);
              ctx.lineTo(ruleX + tickW, ry);
              ctx.stroke();
            }

            // Natural length & equilibrium dashed lines
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
            ctx.beginPath();
            ctx.moveTo(anchorX - 40, naturalBottomY);
            ctx.lineTo(ruleX, naturalBottomY);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
            ctx.beginPath();
            ctx.moveTo(anchorX - 40, naturalBottomY + staticExtPx);
            ctx.lineTo(ruleX, naturalBottomY + staticExtPx);
            ctx.stroke();
            ctx.setLineDash([]);

            // Helical spring coils
            const coils = 12;
            const springLen = Math.max(40, massTopY - topY);
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(anchorX, topY);
            for (let c = 1; c <= coils; c++) {
              const cy = topY + (c / (coils + 1)) * springLen;
              const cx = anchorX + (c % 2 === 0 ? -16 : 16);
              ctx.lineTo(cx, cy);
            }
            ctx.lineTo(anchorX, massTopY);
            ctx.stroke();

            // Slotted mass hanger + pointer
            const blockH = 26 + benchMassKg * 40;
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(anchorX - 24, massTopY, 48, blockH);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(anchorX - 24, massTopY, 48, blockH);
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(anchorX + 24, massTopY + 4);
            ctx.lineTo(ruleX - 2, massTopY + 4);
            ctx.stroke();

            // Live readout HUD
            ctx.fillStyle = '#f8fafc';
            ctx.font = '12px IBM Plex Mono, monospace';
            ctx.fillText(`m = ${(benchMassKg * 1000).toFixed(0)} g  |  k = ${benchSpringK} N/m`, 24, 32);
            ctx.fillText(`Static e = ${((benchMassKg * 9.81 / benchSpringK) * 100).toFixed(2)} cm  |  T = ${(2 * Math.PI / omega).toFixed(3)} s`, 24, 52);
            ctx.fillStyle = '#38bdf8';
            ctx.fillText(`Stopwatch t = ${t.toFixed(2)} s`, w - 180, 32);
          } else if (simMode === 'metre_bridge') {
            // ACSEE 131/3B Q3: Metre Bridge & Null Deflection Galvanometer
            const bridgeY = h - 92;
            const wireLeft = 90;
            const wireRight = w - 90;
            const wireLenPx = wireRight - wireLeft;
            const nullCm = (100 * benchStdR) / Math.max(0.1, benchStdR + benchUnknownX);
            const jockeyX = wireLeft + (benchJockeyCm / 100) * wireLenPx;
            const topY = 74;
            const midGapX = w / 2;

            // Copper strips
            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 6;
            ctx.beginPath();
            // Left L strip
            ctx.moveTo(wireLeft, bridgeY);
            ctx.lineTo(wireLeft, topY + 75);
            ctx.lineTo(wireLeft + 80, topY + 75);
            // Center strip
            ctx.moveTo(midGapX - 75, topY + 75);
            ctx.lineTo(midGapX + 75, topY + 75);
            // Right L strip
            ctx.moveTo(wireRight - 80, topY + 75);
            ctx.lineTo(wireRight, topY + 75);
            ctx.lineTo(wireRight, bridgeY);
            ctx.stroke();

            // Driver circuit (Cell + Plug Key)
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(wireLeft, bridgeY);
            ctx.lineTo(wireLeft - 34, bridgeY);
            ctx.lineTo(wireLeft - 34, topY);
            ctx.lineTo(wireRight + 34, topY);
            ctx.lineTo(wireRight + 34, bridgeY);
            ctx.lineTo(wireRight, bridgeY);
            ctx.stroke();

            // Driver battery badge
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(midGapX - 46, topY - 16, 92, 32);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.strokeRect(midGapX - 46, topY - 16, 92, 32);
            ctx.fillStyle = '#f8fafc';
            ctx.font = '11px IBM Plex Mono, monospace';
            ctx.fillText(`E=${benchEmfV.toFixed(1)}V Key`, midGapX - 38, topY + 4);

            // Standard Resistor R (left gap) & Unknown X (right gap)
            ctx.fillStyle = '#1e293b';
            ctx.strokeStyle = '#22d3ee';
            ctx.fillRect(wireLeft + 80, topY + 57, midGapX - 75 - (wireLeft + 80), 36);
            ctx.strokeRect(wireLeft + 80, topY + 57, midGapX - 75 - (wireLeft + 80), 36);
            ctx.strokeStyle = '#f59e0b';
            ctx.fillRect(midGapX + 75, topY + 57, wireRight - 80 - (midGapX + 75), 36);
            ctx.strokeRect(midGapX + 75, topY + 57, wireRight - 80 - (midGapX + 75), 36);

            ctx.fillStyle = '#f8fafc';
            ctx.fillText(`R = ${benchStdR.toFixed(1)}Ω`, wireLeft + 94, topY + 79);
            ctx.fillText(`X = ${benchUnknownX.toFixed(1)}Ω`, midGapX + 89, topY + 79);

            // Metre Bridge Manganin Wire & 0-100cm Scale
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(wireLeft, bridgeY);
            ctx.lineTo(wireRight, bridgeY);
            ctx.stroke();

            ctx.fillStyle = '#eab308';
            ctx.fillRect(wireLeft, bridgeY + 12, wireLenPx, 20);
            ctx.fillStyle = '#0f172a';
            for (let cm = 0; cm <= 100; cm += 10) {
              const tx = wireLeft + (cm / 100) * wireLenPx;
              ctx.fillRect(tx - 0.5, bridgeY + 12, 1, 7);
              ctx.font = '9px IBM Plex Mono, monospace';
              ctx.fillText(String(cm), tx - 6, bridgeY + 28);
            }

            // Centre-Zero Galvanometer Gauge + Wire to Jockey
            const galvY = topY + 148;
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(midGapX, topY + 75);
            ctx.lineTo(midGapX, galvY - 30);
            ctx.moveTo(midGapX, galvY + 30);
            ctx.lineTo(jockeyX, bridgeY);
            ctx.stroke();

            ctx.fillStyle = '#1e293b';
            ctx.beginPath();
            ctx.arc(midGapX, galvY, 32, 0, Math.PI * 2);
            ctx.fill();
            const isNull = Math.abs(benchJockeyCm - nullCm) < 1.0;
            ctx.strokeStyle = isNull ? '#10b981' : '#f59e0b';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Galvanometer Needle deflection
            const deflNorm = Math.max(-1, Math.min(1, (benchJockeyCm - nullCm) / 35));
            const needleAngle = -Math.PI / 2 + deflNorm * 0.95;
            ctx.strokeStyle = isNull ? '#10b981' : '#f43f5e';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(midGapX, galvY + 10);
            ctx.lineTo(midGapX + 24 * Math.cos(needleAngle), galvY + 10 + 24 * Math.sin(needleAngle));
            ctx.stroke();
            ctx.fillStyle = '#f8fafc';
            ctx.font = '10px IBM Plex Mono, monospace';
            ctx.fillText('G', midGapX - 3, galvY + 24);

            // Sliding Jockey Arrow
            ctx.fillStyle = isNull ? '#10b981' : '#38bdf8';
            ctx.beginPath();
            ctx.moveTo(jockeyX, bridgeY);
            ctx.lineTo(jockeyX - 7, bridgeY - 14);
            ctx.lineTo(jockeyX + 7, bridgeY - 14);
            ctx.closePath();
            ctx.fill();

            // Animated current pulses along driver loop
            const pulseCount = 8;
            ctx.fillStyle = '#38bdf8';
            for (let k = 0; k < pulseCount; k++) {
              const frac = ((t * 0.25 + k / pulseCount) % 1);
              const px = wireLeft + frac * wireLenPx;
              ctx.beginPath();
              ctx.arc(px, bridgeY, 3, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.fillStyle = '#f8fafc';
            ctx.font = '12px IBM Plex Mono, monospace';
            ctx.fillText(
              `Jockey l = ${benchJockeyCm.toFixed(1)} cm  |  Null Point l₁ = ${nullCm.toFixed(1)} cm  |  ${isNull ? '● NULL BALANCED (I_g = 0)' : `Galv = ${((benchJockeyCm - nullCm) * 0.45).toFixed(2)} mA`}`,
              24,
              32
            );
          } else if (simMode === 'prism') {
            // ACSEE 131/3A Q2: 60° Glass Prism Minimum Deviation Ray Optics
            const apexX = w / 2;
            const apexY = 82;
            const side = 225;
            const leftX = apexX - side * Math.sin(Math.PI / 6);
            const rightX = apexX + side * Math.sin(Math.PI / 6);
            const baseY = apexY + side * Math.cos(Math.PI / 6);

            // Equilateral prism body
            ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(apexX, apexY);
            ctx.lineTo(rightX, baseY);
            ctx.lineTo(leftX, baseY);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Left face normal at mid-point
            const hitX = (apexX + leftX) / 2;
            const hitY = (apexY + baseY) / 2;
            const leftNormalAngle = -Math.PI + Math.PI / 6; // pointing outward upper-left (-150 deg)
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(hitX + 75 * Math.cos(leftNormalAngle), hitY + 75 * Math.sin(leftNormalAngle));
            ctx.lineTo(hitX - 65 * Math.cos(leftNormalAngle), hitY - 65 * Math.sin(leftNormalAngle));
            ctx.stroke();
            ctx.setLineDash([]);

            // Incident ray approaching at angle i relative to outward normal
            const incRad = (benchIncidenceDeg * Math.PI) / 180;
            const incDirOut = leftNormalAngle - incRad;
            const srcX = hitX + 165 * Math.cos(incDirOut);
            const srcY = hitY + 165 * Math.sin(incDirOut);

            // Ray 1 (Incident + optical pins P1, P2)
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.moveTo(srcX, srcY);
            ctx.lineTo(hitX, hitY);
            ctx.stroke();

            // Forward dashed extension of incident ray
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(hitX, hitY);
            ctx.lineTo(hitX - 240 * Math.cos(incDirOut), hitY - 240 * Math.sin(incDirOut));
            ctx.stroke();
            ctx.setLineDash([]);

            // Optical Pins P1, P2
            [0.35, 0.72].forEach((f, idx) => {
              const px = hitX + (srcX - hitX) * f;
              const py = hitY + (srcY - hitY) * f;
              ctx.fillStyle = '#f43f5e';
              ctx.beginPath();
              ctx.arc(px, py, 4.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#f8fafc';
              ctx.font = '10px IBM Plex Mono, monospace';
              ctx.fillText(`P${idx + 1}`, px - 8, py - 8);
            });

            // Internal refracted ray inside prism
            const r1 = Math.asin(Math.sin(incRad) / benchRefractiveN);
            const internalAngle = leftNormalAngle + Math.PI - r1;
            // Trace across prism to right face
            const lenInternal = 122;
            const exitX = hitX + lenInternal * Math.cos(internalAngle);
            const exitY = hitY + lenInternal * Math.sin(internalAngle);

            ctx.strokeStyle = '#22d3ee';
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(hitX, hitY);
            ctx.lineTo(exitX, exitY);
            ctx.stroke();

            const r2 = (60 * Math.PI) / 180 - r1;
            const sinEVal = benchRefractiveN * Math.sin(r2);
            const rightNormalOut = -Math.PI / 6;

            if (Math.abs(sinEVal) <= 1) {
              const eRad = Math.asin(sinEVal);
              const emergDir = rightNormalOut + eRad;
              const endX = exitX + 165 * Math.cos(emergDir);
              const endY = exitY + 165 * Math.sin(emergDir);

              ctx.strokeStyle = '#fbbf24';
              ctx.lineWidth = 2.6;
              ctx.beginPath();
              ctx.moveTo(exitX, exitY);
              ctx.lineTo(endX, endY);
              ctx.stroke();

              // Backward extension of emergent ray
              ctx.setLineDash([5, 5]);
              ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(exitX, exitY);
              ctx.lineTo(exitX - 180 * Math.cos(emergDir), exitY - 180 * Math.sin(emergDir));
              ctx.stroke();
              ctx.setLineDash([]);

              // Optical pins P3, P4
              [0.35, 0.72].forEach((f, idx) => {
                const px = exitX + (endX - exitX) * f;
                const py = exitY + (endY - exitY) * f;
                ctx.fillStyle = '#10b981';
                ctx.beginPath();
                ctx.arc(px, py, 4.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#f8fafc';
                ctx.font = '10px IBM Plex Mono, monospace';
                ctx.fillText(`P${idx + 3}`, px + 6, py - 8);
              });

              const dev = benchIncidenceDeg + (eRad * 180) / Math.PI - 60;
              ctx.fillStyle = '#f8fafc';
              ctx.font = '12px IBM Plex Mono, monospace';
              ctx.fillText(`i = ${benchIncidenceDeg}°  |  e = ${((eRad * 180) / Math.PI).toFixed(1)}°  |  Deviation D = ${dev.toFixed(2)}°  |  n = ${benchRefractiveN.toFixed(2)}`, 24, 32);
            } else {
              // Total Internal Reflection back toward base
              ctx.strokeStyle = '#f43f5e';
              ctx.lineWidth = 2.4;
              ctx.beginPath();
              ctx.moveTo(exitX, exitY);
              ctx.lineTo(exitX - 45, baseY - 10);
              ctx.stroke();
              ctx.fillStyle = '#fb7185';
              ctx.font = '12px IBM Plex Mono, monospace';
              ctx.fillText(`Total Internal Reflection (r₂ > Critical Angle)  |  n = ${benchRefractiveN.toFixed(2)}`, 24, 32);
            }
          } else if (simMode === 'moments') {
            // ACSEE 131/3C Q1: Principle of Moments & Balanced Uniform Metre Rule
            const pivotX = w / 2;
            const pivotY = h / 2 + 45;
            const ruleWidth = 520;
            const tauL = benchMassKg * 9.81 * (benchMomentDistCm / 100);
            const tauR = benchMomentRightMassKg * 9.81 * (benchMomentRightDistCm / 100);
            const netTau = tauR - tauL; // positive = tilts clockwise
            const balanced = Math.abs(netTau) < 0.015;
            const eqTilt = Math.max(-0.28, Math.min(0.28, netTau * 0.45));
            const dynamicTilt = balanced ? 0 : eqTilt * (1 - 0.15 * Math.cos(3 * t));

            // Triangular knife-edge fulcrum
            ctx.fillStyle = '#94a3b8';
            ctx.beginPath();
            ctx.moveTo(pivotX, pivotY);
            ctx.lineTo(pivotX - 28, pivotY + 62);
            ctx.lineTo(pivotX + 28, pivotY + 62);
            ctx.closePath();
            ctx.fill();

            // Rotated Metre Rule
            ctx.save();
            ctx.translate(pivotX, pivotY);
            ctx.rotate(dynamicTilt);

            ctx.fillStyle = '#eab308';
            ctx.fillRect(-ruleWidth / 2, -14, ruleWidth, 14);
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1;
            for (let cm = 0; cm <= 100; cm += 5) {
              const rx = -ruleWidth / 2 + (cm / 100) * ruleWidth;
              ctx.beginPath();
              ctx.moveTo(rx, -14);
              ctx.lineTo(rx, cm % 10 === 0 ? -4 : -9);
              ctx.stroke();
            }

            // Left mass m1 at d1 cm left of fulcrum
            const leftPx = -(benchMomentDistCm / 50) * (ruleWidth / 2);
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(leftPx, 0);
            ctx.lineTo(leftPx, 46);
            ctx.stroke();
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(leftPx - 18, 46, 36, 26 + benchMassKg * 40);
            ctx.fillStyle = '#f8fafc';
            ctx.font = '11px IBM Plex Mono, monospace';
            ctx.fillText(`${(benchMassKg * 1000).toFixed(0)}g`, leftPx - 14, 66);

            // Right mass m2 at d2 cm right of fulcrum
            const rightPx = (benchMomentRightDistCm / 50) * (ruleWidth / 2);
            ctx.strokeStyle = '#e2e8f0';
            ctx.beginPath();
            ctx.moveTo(rightPx, 0);
            ctx.lineTo(rightPx, 46);
            ctx.stroke();
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(rightPx - 18, 46, 36, 26 + benchMomentRightMassKg * 40);
            ctx.fillStyle = '#0f172a';
            ctx.fillText(`${(benchMomentRightMassKg * 1000).toFixed(0)}g`, rightPx - 14, 66);

            ctx.restore();

            ctx.fillStyle = '#f8fafc';
            ctx.font = '12px IBM Plex Mono, monospace';
            ctx.fillText(
              `τ_acw = ${tauL.toFixed(3)} N·m  |  τ_cw = ${tauR.toFixed(3)} N·m  |  ${balanced ? '● EQUILIBRIUM BALANCED' : netTau > 0 ? '▲ TILTING CLOCKWISE' : '▲ TILTING ANTICLOCKWISE'}`,
              24,
              32
            );
          } else if (simMode === 'cooling') {
            // ACSEE 131/3C Q2: Newton's Law of Cooling + Real-Time Cooling Curve
            const tempAtT = 25 + (85 - 25) * Math.exp(-benchCoolConstantK * benchCoolTimeMin);
            const warmFrac = Math.max(0, Math.min(1, (tempAtT - 25) / 60));
            const liquidColor = `rgb(${Math.round(56 + warmFrac * 185)}, ${Math.round(189 - warmFrac * 120)}, ${Math.round(248 - warmFrac * 190)})`;

            // Left: Lagged Calorimeter & Thermometer
            const calX = 110;
            const calY = 145;
            ctx.fillStyle = '#334155';
            ctx.fillRect(calX - 8, calY - 8, 126, 178);
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(calX + 4, calY, 102, 158);
            ctx.fillStyle = liquidColor;
            ctx.fillRect(calX + 8, calY + 34, 94, 120);

            // Thermometer bulb & rising mercury column
            const thermX = calX + 55;
            const bulbY = calY + 128;
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(thermX - 5, 55, 10, bulbY - 55);
            const colH = 20 + warmFrac * 140;
            ctx.fillStyle = '#f43f5e';
            ctx.fillRect(thermX - 2.5, bulbY - colH, 5, colH);
            ctx.beginPath();
            ctx.arc(thermX, bulbY, 9, 0, Math.PI * 2);
            ctx.fill();

            // Right: Live Temperature-Time Graph
            const gLeft = 295;
            const gRight = w - 42;
            const gTop = 64;
            const gBottom = h - 54;
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(gLeft, gTop);
            ctx.lineTo(gLeft, gBottom);
            ctx.lineTo(gRight, gBottom);
            ctx.stroke();

            // Ambient 25°C asymptote
            const ambY = gBottom - ((25 - 15) / 80) * (gBottom - gTop);
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = '#10b981';
            ctx.beginPath();
            ctx.moveTo(gLeft, ambY);
            ctx.lineTo(gRight, ambY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Exponential cooling curve
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (let m = 0; m <= 25; m += 0.5) {
              const tm = 25 + (85 - 25) * Math.exp(-benchCoolConstantK * m);
              const px = gLeft + (m / 25) * (gRight - gLeft);
              const py = gBottom - ((tm - 15) / 80) * (gBottom - gTop);
              if (m === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.stroke();

            // Current time marker dot
            const curX = gLeft + (benchCoolTimeMin / 25) * (gRight - gLeft);
            const curY = gBottom - ((tempAtT - 15) / 80) * (gBottom - gTop);
            ctx.fillStyle = '#f43f5e';
            ctx.beginPath();
            ctx.arc(curX, curY, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#f8fafc';
            ctx.font = '12px IBM Plex Mono, monospace';
            ctx.fillText(`t = ${benchCoolTimeMin} min  |  θ = ${tempAtT.toFixed(2)} °C  |  k = ${benchCoolConstantK.toFixed(3)} min⁻¹  |  Ambient θ₀ = 25°C`, 24, 32);
          } else if (simMode === 'custom_bench') {
            // Live animated emulation of whatever instruments are connected on user's custom bench
            const scaleX = w / 550;
            const scaleY = h / 340;
            wires.forEach((wire) => {
              const a = placedNodes.find((n) => n.id === wire.fromId);
              const b = placedNodes.find((n) => n.id === wire.toId);
              if (!a || !b) return;
              const ax = a.x * scaleX;
              const ay = a.y * scaleY;
              const bx = b.x * scaleX;
              const by = b.y * scaleY;
              ctx.strokeStyle = '#38bdf8';
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(bx, by);
              ctx.stroke();

              // Animated energy/signal pulses along connected wires
              const frac = (t * 0.6) % 1;
              const px = ax + (bx - ax) * frac;
              const py = ay + (by - ay) * frac;
              ctx.fillStyle = '#fbbf24';
              ctx.beginPath();
              ctx.arc(px, py, 4, 0, Math.PI * 2);
              ctx.fill();
            });

            placedNodes.forEach((node) => {
              const nx = node.x * scaleX;
              const ny = node.y * scaleY;
              ctx.fillStyle = '#1e293b';
              ctx.strokeStyle = connectedTypes.has(node.type) ? '#10b981' : '#64748b';
              ctx.lineWidth = 2;
              ctx.fillRect(nx - 54, ny - 16, 108, 32);
              ctx.strokeRect(nx - 54, ny - 16, 108, 32);
              ctx.fillStyle = '#f8fafc';
              ctx.font = '10px IBM Plex Mono, monospace';
              ctx.fillText(node.label.slice(0, 15), nx - 46, ny + 4);
            });

            ctx.fillStyle = '#f8fafc';
            ctx.font = '12px IBM Plex Mono, monospace';
            ctx.fillText(
              `Custom Bench: ${placedNodes.length} Instruments · ${wires.length} Active Links · ${hasElectricCircuit ? `I=${elecCurrentA.toFixed(2)}A` : hasSpringOrPendulum ? `T=${springPeriodS.toFixed(2)}s` : hasOptics && !Number.isNaN(deviationDeg) ? `D=${deviationDeg.toFixed(1)}°` : hasMoments ? `τ=${torqueLeft.toFixed(2)}N·m` : hasCalorimetry ? `θ=${coolingTempC.toFixed(1)}°C` : 'Ready'}`,
              24,
              32
            );
          } else if (simMode === 'pendulum') {
            const pivotX = w / 2;
            const pivotY = 48;
            const omega = Math.sqrt(gravity / pendLength);
            const thetaMax = (pendAngleDeg * Math.PI) / 180;
            const theta = thetaMax * Math.cos(omega * t);
            const pxLen = 85 + pendLength * 70;
            const bobX = pivotX + pxLen * Math.sin(theta);
            const bobY = pivotY + pxLen * Math.cos(theta);

            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
            ctx.beginPath();
            ctx.moveTo(pivotX, pivotY);
            ctx.lineTo(pivotX, pivotY + pxLen + 20);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(pivotX - 40, pivotY - 8, 80, 8);

            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(pivotX, pivotY);
            ctx.lineTo(bobX, bobY);
            ctx.stroke();

            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(bobX, bobY, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#f8fafc';
            ctx.font = '12px IBM Plex Mono, monospace';
            ctx.fillText(`θ(t) = ${((theta * 180) / Math.PI).toFixed(1)}°`, 24, 34);
            ctx.fillText(`ω = ${omega.toFixed(2)} rad/s`, 24, 54);
          } else if (simMode === 'projectile') {
            const groundY = h - 44;
            const originX = 56;
            const thetaRad = (projAngleDeg * Math.PI) / 180;
            const vx = projSpeed * Math.cos(thetaRad);
            const vy = projSpeed * Math.sin(thetaRad);
            const tFlight = (2 * vy) / gravity;
            const range = vx * tFlight;
            const maxH = (vy * vy) / (2 * gravity);
            const scale = Math.min((w - 110) / Math.max(range, 20), (groundY - 50) / Math.max(maxH, 10));

            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(24, groundY);
            ctx.lineTo(w - 24, groundY);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let s = 0; s <= 60; s++) {
              const tt = (s / 60) * tFlight;
              const px = originX + vx * tt * scale;
              const py = groundY - (vy * tt - 0.5 * gravity * tt * tt) * scale;
              if (s === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.stroke();

            const curT = t % Math.max(tFlight, 0.5);
            const curX = originX + vx * curT * scale;
            const curY = groundY - (vy * curT - 0.5 * gravity * curT * curT) * scale;
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(curX, curY, 9, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#f8fafc';
            ctx.font = '12px IBM Plex Mono, monospace';
            ctx.fillText(`t = ${curT.toFixed(2)} s / ${tFlight.toFixed(2)} s`, 24, 34);
            ctx.fillText(`H_max = ${maxH.toFixed(2)} m · Range = ${range.toFixed(2)} m`, 24, 54);
          } else if (simMode === 'circuit') {
            const req = circuitType === 'series' ? r1 + r2 : (r1 * r2) / (r1 + r2);
            const current = voltage / Math.max(req, 0.1);

            const left = 110;
            const right = w - 110;
            const top = 80;
            const bottom = h - 70;
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 3;
            ctx.strokeRect(left, top, right - left, bottom - top);

            ctx.fillStyle = '#0f172a';
            ctx.fillRect(left - 18, (top + bottom) / 2 - 22, 36, 44);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(left - 18, (top + bottom) / 2 - 8);
            ctx.lineTo(left + 18, (top + bottom) / 2 - 8);
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(left - 10, (top + bottom) / 2 + 8);
            ctx.lineTo(left + 10, (top + bottom) / 2 + 8);
            ctx.stroke();

            ctx.fillStyle = '#1e293b';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            if (circuitType === 'series') {
              ctx.fillRect(w / 2 - 110, top - 14, 80, 28);
              ctx.strokeRect(w / 2 - 110, top - 14, 80, 28);
              ctx.fillRect(w / 2 + 30, top - 14, 80, 28);
              ctx.strokeRect(w / 2 + 30, top - 14, 80, 28);
              ctx.fillStyle = '#f8fafc';
              ctx.font = '12px IBM Plex Mono, monospace';
              ctx.fillText(`R1=${r1}Ω`, w / 2 - 96, top + 4);
              ctx.fillText(`R2=${r2}Ω`, w / 2 + 44, top + 4);
            } else {
              ctx.strokeStyle = '#cbd5e1';
              ctx.beginPath();
              ctx.moveTo(w / 2 - 90, top);
              ctx.lineTo(w / 2 - 90, top + 70);
              ctx.lineTo(w / 2 + 90, top + 70);
              ctx.lineTo(w / 2 + 90, top);
              ctx.stroke();

              ctx.fillStyle = '#1e293b';
              ctx.strokeStyle = '#f59e0b';
              ctx.fillRect(w / 2 - 40, top - 14, 80, 28);
              ctx.strokeRect(w / 2 - 40, top - 14, 80, 28);
              ctx.fillRect(w / 2 - 40, top + 56, 80, 28);
              ctx.strokeRect(w / 2 - 40, top + 56, 80, 28);

              ctx.fillStyle = '#f8fafc';
              ctx.font = '12px IBM Plex Mono, monospace';
              ctx.fillText(`R1=${r1}Ω`, w / 2 - 26, top + 4);
              ctx.fillText(`R2=${r2}Ω`, w / 2 - 26, top + 74);
            }

            const perimeter = 2 * (right - left + (bottom - top));
            const speed = Math.min(280, current * 24);
            ctx.fillStyle = '#38bdf8';
            for (let k = 0; k < 14; k++) {
              const dist = (t * speed + (k / 14) * perimeter) % perimeter;
              let dx = left;
              let dy = top;
              const topLen = right - left;
              const sideLen = bottom - top;
              if (dist < topLen) {
                dx = left + dist;
                dy = top;
              } else if (dist < topLen + sideLen) {
                dx = right;
                dy = top + (dist - topLen);
              } else if (dist < 2 * topLen + sideLen) {
                dx = right - (dist - topLen - sideLen);
                dy = bottom;
              } else {
                dx = left;
                dy = bottom - (dist - 2 * topLen - sideLen);
              }
              ctx.beginPath();
              ctx.arc(dx, dy, 4, 0, Math.PI * 2);
              ctx.fill();
            }

            ctx.fillStyle = '#f8fafc';
            ctx.font = '12px IBM Plex Mono, monospace';
            ctx.fillText(`V = ${voltage} V  |  R_eq = ${req.toFixed(2)} Ω  |  I = ${current.toFixed(2)} A`, 24, 34);
          } else if (simMode === 'interference') {
            const slitX = 90;
            const screenX = w - 120;
            const sepPx = slitSepMm * 90;
            const slit1Y = h / 2 - sepPx / 2;
            const slit2Y = h / 2 + sepPx / 2;
            const hue = Math.max(0, Math.min(270, ((700 - wavelengthNm) / 300) * 270));
            const waveColor = `hsl(${hue}, 90%, 60%)`;

            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(slitX, 20);
            ctx.lineTo(slitX, slit1Y - 8);
            ctx.moveTo(slitX, slit1Y + 8);
            ctx.lineTo(slitX, slit2Y - 8);
            ctx.moveTo(slitX, slit2Y + 8);
            ctx.lineTo(slitX, h - 20);
            ctx.stroke();

            const lambdaPx = (wavelengthNm / 550) * 28;
            const phase = (t * 40) % lambdaPx;
            ctx.strokeStyle = waveColor;
            ctx.globalAlpha = 0.32;
            ctx.lineWidth = 1.5;
            for (let r = phase; r < screenX - slitX; r += lambdaPx) {
              ctx.beginPath();
              ctx.arc(slitX, slit1Y, r, -Math.PI / 2, Math.PI / 2);
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(slitX, slit2Y, r, -Math.PI / 2, Math.PI / 2);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;

            const fringeWidthMm = ((wavelengthNm * 1e-9 * screenDistM) / (slitSepMm * 1e-3)) * 1000;
            ctx.strokeStyle = waveColor;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            for (let py = 24; py < h - 24; py += 2) {
              const dy = py - h / 2;
              const deltaPhase = (dy * slitSepMm) / (wavelengthNm * 0.045 * screenDistM);
              const intensity = Math.pow(Math.cos(deltaPhase), 2);
              const gx = screenX + intensity * 64;
              if (py === 24) ctx.moveTo(gx, py);
              else ctx.lineTo(gx, py);
            }
            ctx.stroke();

            ctx.fillStyle = '#f8fafc';
            ctx.font = '12px IBM Plex Mono, monospace';
            ctx.fillText(`λ = ${wavelengthNm} nm  |  Fringe Spacing β = ${fringeWidthMm.toFixed(2)} mm`, 24, 34);
          }
        }
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [
    subTab,
    simMode,
    isPlaying,
    pendLength,
    gravity,
    pendAngleDeg,
    projSpeed,
    projAngleDeg,
    voltage,
    r1,
    r2,
    circuitType,
    wavelengthNm,
    slitSepMm,
    screenDistM,
    benchMassKg,
    benchSpringK,
    benchEmfV,
    benchStdR,
    benchUnknownX,
    benchJockeyCm,
    benchIncidenceDeg,
    benchRefractiveN,
    benchMomentDistCm,
    benchMomentRightMassKg,
    benchMomentRightDistCm,
    benchCoolTimeMin,
    benchCoolConstantK,
    placedNodes,
    wires,
    connectedTypes,
    hasElectricCircuit,
    hasSpringOrPendulum,
    hasOptics,
    hasMoments,
    hasCalorimetry,
    elecCurrentA,
    springPeriodS,
    deviationDeg,
    torqueLeft,
    coolingTempC,
  ]);

  // --- Scientific Calculator State ---
  const [calcExpr, setCalcExpr] = useState('');
  const [calcResult, setCalcResult] = useState('0');
  const [angleMode, setAngleMode] = useState<'DEG' | 'RAD'>('DEG');
  const [calcHistory, setCalcHistory] = useState<Array<{ expr: string; res: string }>>([]);

  const appendCalc = (token: string) => setCalcExpr((prev) => prev + token);

  const factorial = (n: number): number => {
    if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  };

  const evaluateCalc = () => {
    if (!calcExpr.trim()) return;
    try {
      const toRad = (x: number) => (angleMode === 'DEG' ? (x * Math.PI) / 180 : x);
      const fromRad = (x: number) => (angleMode === 'DEG' ? (x * 180) / Math.PI : x);
      const scope = {
        sin: (x: number) => Math.sin(toRad(x)),
        cos: (x: number) => Math.cos(toRad(x)),
        tan: (x: number) => Math.tan(toRad(x)),
        asin: (x: number) => fromRad(Math.asin(x)),
        acos: (x: number) => fromRad(Math.acos(x)),
        atan: (x: number) => fromRad(Math.atan(x)),
        log: (x: number) => Math.log10(x),
        ln: (x: number) => Math.log(x),
        sqrt: (x: number) => Math.sqrt(x),
        abs: (x: number) => Math.abs(x),
        fact: factorial,
        PI: Math.PI,
        E: Math.E,
      };
      const sanitized = calcExpr
        .replace(/π/g, 'PI')
        .replace(/√\(/g, 'sqrt(')
        .replace(/\^/g, '**')
        .replace(/(\d+)!/g, 'fact($1)');

      const fn = new Function(...Object.keys(scope), `"use strict"; return (${sanitized});`);
      const val = fn(...Object.values(scope));
      const formatted =
        typeof val === 'number' && Number.isFinite(val)
          ? Math.abs(val) > 1e6 || (Math.abs(val) > 0 && Math.abs(val) < 1e-4)
            ? val.toExponential(5)
            : Number(val.toPrecision(10)).toString()
          : 'Error';
      setCalcResult(formatted);
      setCalcHistory((prev) => [{ expr: calcExpr, res: formatted }, ...prev.slice(0, 9)]);
    } catch {
      setCalcResult('Syntax Error');
    }
  };

  const pendPeriod = 2 * Math.PI * Math.sqrt(pendLength / gravity);
  const projTheta = (projAngleDeg * Math.PI) / 180;
  const projMaxH = (Math.pow(projSpeed * Math.sin(projTheta), 2)) / (2 * gravity);
  const projRange = (projSpeed * projSpeed * Math.sin(2 * projTheta)) / gravity;
  const req = circuitType === 'series' ? r1 + r2 : (r1 * r2) / (r1 + r2);
  const currentA = voltage / Math.max(req, 0.1);
  const fringeMm = ((wavelengthNm * 1e-9 * screenDistM) / (slitSepMm * 1e-3)) * 1000;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          <button
            onClick={() => setSubTab('custom')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'custom'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            ACSEE Practicals & Custom Apparatus
          </button>
          <button
            onClick={() => setSubTab('emulation')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'emulation'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Physics Emulations
          </button>
          <button
            onClick={() => setSubTab('calculator')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              subTab === 'calculator'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Scientific Calculator
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          NECTA ACSEE 131/3 Practicals · Custom Instrument Connections · Offline Ready
        </p>
      </div>

      {subTab === 'custom' && (
        <div className="space-y-6">
          {/* ACSEE Practical Presets Strip */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  ACSEE Paper 3 Practicals & Custom Lab Workbench
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Load an official ACSEE practical or clear the bench to add and connect any instruments you want.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setSimMode(presetToSimMode(activePresetId));
                    simTimeRef.current = 0;
                    setSubTab('emulation');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-700 text-white rounded-lg hover:bg-sky-800 whitespace-nowrap shrink-0"
                >
                  <Activity className="w-3.5 h-3.5" />
                  Run in Live Emulation
                </button>
                <button
                  onClick={clearToBlankBench}
                  className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  New Blank Custom Practical
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {ACSEE_PRACTICAL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => loadPreset(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    activePresetId === p.id
                      ? 'bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {p.paperCode}: {p.title}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Apparatus Palette */}
            <div className="lg:col-span-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 max-h-[540px] overflow-y-auto">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                Apparatus Inventory (Click to Place)
              </h3>
              {(['Mechanics', 'Electricity', 'Optics & Heat'] as const).map((cat) => (
                <div key={cat} className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{cat}</p>
                  <div className="space-y-1">
                    {INSTRUMENTS_PALETTE.filter((i) => i.category === cat).map((inst) => (
                      <button
                        key={inst.type}
                        onClick={() => addInstrumentToBench(inst)}
                        className="w-full px-2.5 py-1.5 text-left text-xs text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:border-sky-300 dark:hover:border-sky-700 flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{inst.label}</span>
                        <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Center: Interactive Apparatus Connection Bench */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="flex-1 text-sm font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setConnectMode((m) => !m);
                        setConnectFromId(null);
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 ${
                        connectMode
                          ? 'bg-sky-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      {connectMode ? 'Connecting (Click 2 Items)' : 'Connect Wires'}
                    </button>
                    <button
                      onClick={() => setWires([])}
                      title="Clear all connections"
                      className="p-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                    >
                      <Unlink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Interactive Bench Canvas */}
                <div
                  ref={benchRef}
                  onPointerMove={handleBenchPointerMove}
                  onPointerUp={() => setDraggingId(null)}
                  onPointerLeave={() => setDraggingId(null)}
                  className="relative h-[340px] bg-slate-900 rounded-xl border border-slate-800 overflow-hidden select-none"
                >
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {wires.map((w) => {
                      const a = placedNodes.find((n) => n.id === w.fromId);
                      const b = placedNodes.find((n) => n.id === w.toId);
                      if (!a || !b) return null;
                      return (
                        <line
                          key={w.id}
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          strokeDasharray={a.category === 'Mechanics' ? '5 4' : undefined}
                        />
                      );
                    })}
                  </svg>

                  {placedNodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 p-6 text-center">
                      Click any instruments on the left inventory to place them on your custom bench, drag to arrange, then click "Connect Wires" to link them.
                    </div>
                  )}

                  {placedNodes.map((node) => {
                    const isSource = connectFromId === node.id;
                    return (
                      <div
                        key={node.id}
                        style={{ left: node.x, top: node.y }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (connectMode) {
                            handleNodeClick(node.id);
                          } else {
                            setDraggingId(node.id);
                          }
                        }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          isSource
                            ? 'bg-sky-600 border-white text-white'
                            : 'bg-slate-800 border-slate-600 text-slate-100 hover:border-sky-400'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium whitespace-nowrap max-w-[110px] truncate">{node.label}</span>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeInstrument(node.id);
                            }}
                            className="text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {placedNodes.length} instruments on bench · {wires.length} active connections. Drag nodes to arrange or toggle Connect Wires.
                </p>
              </div>
            </div>

            {/* Right: Live Connected Apparatus Dials & Output */}
            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Live Apparatus Controls & Readings
              </h3>

              {wires.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                  Connect two or more instruments on the bench to see live quantitative physics outputs.
                </p>
              ) : (
                <div className="space-y-4">
                  {hasElectricCircuit && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2.5 text-xs text-slate-700 dark:text-slate-200">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">Electrical Circuit Readout</p>
                      <div className="font-mono space-y-1">
                        <p>Total Resistance R_eq = {elecTotalR.toFixed(2)} Ω</p>
                        <p>Ammeter Current I = {elecCurrentA.toFixed(3)} A</p>
                        <p>Voltmeter across R = {elecVoltDropV.toFixed(2)} V</p>
                        {connectedTypes.has('metre_bridge') && (
                          <p className="text-sky-800 dark:text-sky-300">
                            Null Balance l₁ = {bridgeNullCm.toFixed(1)} cm · Galv = {galvDeflectionMa.toFixed(2)} mA
                          </p>
                        )}
                      </div>
                      <label className="block">
                        <span className="flex justify-between">
                          <span>Cell EMF (V)</span>
                          <span className="font-mono">{benchEmfV.toFixed(1)} V</span>
                        </span>
                        <input type="range" min="1" max="12" step="0.5" value={benchEmfV} onChange={(e) => setBenchEmfV(Number(e.target.value))} className="w-full" />
                      </label>
                      <label className="block">
                        <span className="flex justify-between">
                          <span>Standard Resistor R</span>
                          <span className="font-mono">{benchStdR.toFixed(1)} Ω</span>
                        </span>
                        <input type="range" min="1" max="20" step="0.5" value={benchStdR} onChange={(e) => setBenchStdR(Number(e.target.value))} className="w-full" />
                      </label>
                      {connectedTypes.has('unknown_resistor') && (
                        <label className="block">
                          <span className="flex justify-between">
                            <span>Unknown X (Lab Target)</span>
                            <span className="font-mono">{benchUnknownX.toFixed(1)} Ω</span>
                          </span>
                          <input type="range" min="1" max="20" step="0.5" value={benchUnknownX} onChange={(e) => setBenchUnknownX(Number(e.target.value))} className="w-full" />
                        </label>
                      )}
                      {connectedTypes.has('rheostat') && (
                        <label className="block">
                          <span className="flex justify-between">
                            <span>Rheostat Slider</span>
                            <span className="font-mono">{benchRheostatR.toFixed(1)} Ω</span>
                          </span>
                          <input type="range" min="0" max="15" step="0.5" value={benchRheostatR} onChange={(e) => setBenchRheostatR(Number(e.target.value))} className="w-full" />
                        </label>
                      )}
                      {connectedTypes.has('metre_bridge') && (
                        <label className="block">
                          <span className="flex justify-between">
                            <span>Jockey Position l</span>
                            <span className="font-mono">{benchJockeyCm.toFixed(1)} cm</span>
                          </span>
                          <input type="range" min="5" max="95" step="0.5" value={benchJockeyCm} onChange={(e) => setBenchJockeyCm(Number(e.target.value))} className="w-full" />
                        </label>
                      )}
                    </div>
                  )}

                  {hasSpringOrPendulum && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2.5 text-xs text-slate-700 dark:text-slate-200">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">Oscillation & Hooke’s Law Readout</p>
                      <div className="font-mono space-y-1">
                        <p>Extension e = {springExtCm.toFixed(2)} cm</p>
                        <p>Period T = {springPeriodS.toFixed(3)} s · T² = {springPeriodSq.toFixed(3)} s²</p>
                      </div>
                      <label className="block">
                        <span className="flex justify-between">
                          <span>Slotted Mass (m)</span>
                          <span className="font-mono">{(benchMassKg * 1000).toFixed(0)} g</span>
                        </span>
                        <input type="range" min="0.05" max="0.50" step="0.05" value={benchMassKg} onChange={(e) => setBenchMassKg(Number(e.target.value))} className="w-full" />
                      </label>
                      <label className="block">
                        <span className="flex justify-between">
                          <span>Spring Constant (k)</span>
                          <span className="font-mono">{benchSpringK} N/m</span>
                        </span>
                        <input type="range" min="10" max="50" step="1" value={benchSpringK} onChange={(e) => setBenchSpringK(Number(e.target.value))} className="w-full" />
                      </label>
                    </div>
                  )}

                  {hasOptics && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2.5 text-xs text-slate-700 dark:text-slate-200">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">60° Prism Ray Optics Readout</p>
                      <div className="font-mono space-y-1">
                        <p>Emergent Angle e = {Number.isNaN(emergentDeg) ? 'TIR' : `${emergentDeg.toFixed(2)}°`}</p>
                        <p>Deviation D = {Number.isNaN(deviationDeg) ? 'Total Internal Reflection' : `${deviationDeg.toFixed(2)}°`}</p>
                      </div>
                      <label className="block">
                        <span className="flex justify-between">
                          <span>Angle of Incidence (i)</span>
                          <span className="font-mono">{benchIncidenceDeg}°</span>
                        </span>
                        <input type="range" min="25" max="75" step="1" value={benchIncidenceDeg} onChange={(e) => setBenchIncidenceDeg(Number(e.target.value))} className="w-full" />
                      </label>
                      <label className="block">
                        <span className="flex justify-between">
                          <span>Prism Refractive Index (n)</span>
                          <span className="font-mono">{benchRefractiveN.toFixed(2)}</span>
                        </span>
                        <input type="range" min="1.33" max="1.75" step="0.01" value={benchRefractiveN} onChange={(e) => setBenchRefractiveN(Number(e.target.value))} className="w-full" />
                      </label>
                    </div>
                  )}

                  {hasMoments && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2.5 text-xs text-slate-700 dark:text-slate-200">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">Moments Equilibrium Readout</p>
                      <div className="font-mono space-y-1">
                        <p>Left Torque τ = {torqueLeft.toFixed(3)} N·m</p>
                        <p>Balance Right Distance d₂ = {requiredRightDistCm.toFixed(1)} cm (100g)</p>
                      </div>
                      <label className="block">
                        <span className="flex justify-between">
                          <span>Left Mass Distance d₁</span>
                          <span className="font-mono">{benchMomentDistCm} cm</span>
                        </span>
                        <input type="range" min="5" max="45" step="1" value={benchMomentDistCm} onChange={(e) => setBenchMomentDistCm(Number(e.target.value))} className="w-full" />
                      </label>
                    </div>
                  )}

                  {hasCalorimetry && (
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2.5 text-xs text-slate-700 dark:text-slate-200">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">Calorimeter Cooling Readout</p>
                      <div className="font-mono space-y-1">
                        <p>Elapsed Time t = {benchCoolTimeMin} min</p>
                        <p>Thermometer θ = {coolingTempC.toFixed(2)} °C</p>
                      </div>
                      <label className="block">
                        <span className="flex justify-between">
                          <span>Cooling Time (min)</span>
                          <span className="font-mono">{benchCoolTimeMin} min</span>
                        </span>
                        <input type="range" min="0" max="25" step="1" value={benchCoolTimeMin} onChange={(e) => setBenchCoolTimeMin(Number(e.target.value))} className="w-full" />
                      </label>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => recordCurrentReading()}
                className="w-full px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700"
              >
                Record Reading to Observation Table
              </button>
            </div>
          </div>

          {/* ACSEE Practical Observation Table & Gradient Calculator */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  ACSEE Practical Observation Table & Least-Squares Gradient
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Record at least 2 readings by varying your connected apparatus sliders to compute slope and intercept.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {readings.length > 0 && (
                  <button
                    onClick={exportPracticalReportPdf}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-700 text-white rounded-lg hover:bg-teal-800"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Practical PDF
                  </button>
                )}
              </div>
            </div>

            {readings.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No experimental readings recorded yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                        <th className="py-2 pr-3 font-medium">Trial</th>
                        <th className="py-2 pr-3 font-medium">{readings[0].xLabel}</th>
                        <th className="py-2 pr-3 font-medium">{readings[0].yLabel}</th>
                        <th className="py-2 font-medium">Apparatus Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs tabular-nums text-slate-800 dark:text-slate-200">
                      {readings.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 pr-3">#{r.trial}</td>
                          <td className="py-2 pr-3">{r.xValue}</td>
                          <td className="py-2 pr-3">{r.yValue}</td>
                          <td className="py-2 font-sans text-slate-600 dark:text-slate-400">{r.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {regression && (
                  <div className="p-3 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-900 rounded-lg font-mono text-xs text-sky-950 dark:text-sky-200">
                    Computed Linear Fit: Slope (Gradient) = <strong>{regression.slope.toFixed(4)}</strong> · Y-Intercept ={' '}
                    <strong>{regression.intercept.toFixed(4)}</strong>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'emulation' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              {(
                [
                  ['spring', '131/3A Spiral Spring'],
                  ['metre_bridge', '131/3B Metre Bridge'],
                  ['prism', '131/3A 60° Prism'],
                  ['moments', '131/3C Moments'],
                  ['cooling', '131/3C Cooling Curve'],
                  ['pendulum', 'Simple Pendulum'],
                  ['projectile', 'Projectile'],
                  ['circuit', "Ohm's Law"],
                  ['interference', 'Double-Slit'],
                  ['custom_bench', 'Custom Bench Live'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    simTimeRef.current = 0;
                    setSimMode(id);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                    simMode === id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying((p) => !p)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 whitespace-nowrap shrink-0"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                onClick={() => {
                  simTimeRef.current = 0;
                  setIsPlaying(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
              <canvas ref={canvasRef} width={760} height={410} className="w-full h-auto block" />
            </div>

            <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-5">
              {simMode === 'spring' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">ACSEE 131/3A: Spiral Spring SHM</h3>
                  <div className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 space-y-1 tabular-nums">
                    <p>Extension e = {springExtCm.toFixed(2)} cm</p>
                    <p>Period T = {springPeriodS.toFixed(3)} s · T² = {springPeriodSq.toFixed(3)} s²</p>
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Slotted Mass (m)</span>
                      <span className="font-mono tabular-nums">{(benchMassKg * 1000).toFixed(0)} g</span>
                    </label>
                    <input type="range" min="0.05" max="0.50" step="0.05" value={benchMassKg} onChange={(e) => setBenchMassKg(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Spring Constant (k)</span>
                      <span className="font-mono tabular-nums">{benchSpringK} N/m</span>
                    </label>
                    <input type="range" min="10" max="50" step="1" value={benchSpringK} onChange={(e) => setBenchSpringK(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              )}

              {simMode === 'metre_bridge' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">ACSEE 131/3B: Metre Bridge</h3>
                  <div className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 space-y-1 tabular-nums">
                    <p>Null Balance l₁ = {bridgeNullCm.toFixed(1)} cm</p>
                    <p>Galvanometer I_g = {galvDeflectionMa.toFixed(2)} mA</p>
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Jockey Position (l)</span>
                      <span className="font-mono tabular-nums">{benchJockeyCm.toFixed(1)} cm</span>
                    </label>
                    <input type="range" min="5" max="95" step="0.5" value={benchJockeyCm} onChange={(e) => setBenchJockeyCm(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Standard Resistor (R)</span>
                      <span className="font-mono tabular-nums">{benchStdR.toFixed(1)} Ω</span>
                    </label>
                    <input type="range" min="1" max="20" step="0.5" value={benchStdR} onChange={(e) => setBenchStdR(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Unknown Resistor (X)</span>
                      <span className="font-mono tabular-nums">{benchUnknownX.toFixed(1)} Ω</span>
                    </label>
                    <input type="range" min="1" max="20" step="0.5" value={benchUnknownX} onChange={(e) => setBenchUnknownX(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              )}

              {simMode === 'prism' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">ACSEE 131/3A: 60° Glass Prism</h3>
                  <div className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 space-y-1 tabular-nums">
                    <p>Emergent Angle e = {Number.isNaN(emergentDeg) ? 'TIR' : `${emergentDeg.toFixed(2)}°`}</p>
                    <p>Deviation D = {Number.isNaN(deviationDeg) ? 'Total Internal Reflection' : `${deviationDeg.toFixed(2)}°`}</p>
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Angle of Incidence (i)</span>
                      <span className="font-mono tabular-nums">{benchIncidenceDeg}°</span>
                    </label>
                    <input type="range" min="25" max="75" step="1" value={benchIncidenceDeg} onChange={(e) => setBenchIncidenceDeg(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Refractive Index (n)</span>
                      <span className="font-mono tabular-nums">{benchRefractiveN.toFixed(2)}</span>
                    </label>
                    <input type="range" min="1.33" max="1.75" step="0.01" value={benchRefractiveN} onChange={(e) => setBenchRefractiveN(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              )}

              {simMode === 'moments' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">ACSEE 131/3C: Principle of Moments</h3>
                  <div className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 space-y-1 tabular-nums">
                    <p>Left Torque = {torqueLeft.toFixed(3)} N·m</p>
                    <p>Right Torque = {torqueRight.toFixed(3)} N·m</p>
                    <p>Balance Target d₂ = {requiredRightDistCm.toFixed(1)} cm</p>
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Left Mass m₁ / Distance d₁</span>
                      <span className="font-mono tabular-nums">{(benchMassKg * 1000).toFixed(0)}g @ {benchMomentDistCm}cm</span>
                    </label>
                    <input type="range" min="5" max="45" step="1" value={benchMomentDistCm} onChange={(e) => setBenchMomentDistCm(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Right Mass (m₂)</span>
                      <span className="font-mono tabular-nums">{(benchMomentRightMassKg * 1000).toFixed(0)} g</span>
                    </label>
                    <input type="range" min="0.05" max="0.30" step="0.05" value={benchMomentRightMassKg} onChange={(e) => setBenchMomentRightMassKg(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Right Distance (d₂)</span>
                      <span className="font-mono tabular-nums">{benchMomentRightDistCm} cm</span>
                    </label>
                    <input type="range" min="5" max="45" step="1" value={benchMomentRightDistCm} onChange={(e) => setBenchMomentRightDistCm(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              )}

              {simMode === 'cooling' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">ACSEE 131/3C: Newton’s Law of Cooling</h3>
                  <div className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 space-y-1 tabular-nums">
                    <p>θ(t) = 25 + 60e^(-kt)</p>
                    <p>Temp θ = {coolingTempC.toFixed(2)} °C at t = {benchCoolTimeMin} min</p>
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Cooling Time (t)</span>
                      <span className="font-mono tabular-nums">{benchCoolTimeMin} min</span>
                    </label>
                    <input type="range" min="0" max="25" step="1" value={benchCoolTimeMin} onChange={(e) => setBenchCoolTimeMin(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Cooling Constant (k)</span>
                      <span className="font-mono tabular-nums">{benchCoolConstantK.toFixed(3)} min⁻¹</span>
                    </label>
                    <input type="range" min="0.03" max="0.18" step="0.005" value={benchCoolConstantK} onChange={(e) => setBenchCoolConstantK(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              )}

              {simMode === 'custom_bench' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Custom Connected Apparatus Live</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Rendering live wiring and signal/energy pulses from your custom practical workbench ({placedNodes.length} instruments, {wires.length} links).
                  </p>
                  <button
                    onClick={() => setSubTab('custom')}
                    className="w-full px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Edit Instruments & Wires on Bench
                  </button>
                </div>
              )}

              {simMode === 'pendulum' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Simple Harmonic Pendulum</h3>
                  <p className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                    T = 2π√(L / g) = <strong>{pendPeriod.toFixed(3)} s</strong>
                  </p>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>String Length (L)</span>
                      <span className="font-mono tabular-nums">{pendLength.toFixed(2)} m</span>
                    </label>
                    <input type="range" min="0.2" max="3.0" step="0.1" value={pendLength} onChange={(e) => setPendLength(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Gravity (g)</span>
                      <span className="font-mono tabular-nums">{gravity.toFixed(2)} m/s²</span>
                    </label>
                    <input type="range" min="1.6" max="24.8" step="0.1" value={gravity} onChange={(e) => setGravity(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Release Angle (θ₀)</span>
                      <span className="font-mono tabular-nums">{pendAngleDeg}°</span>
                    </label>
                    <input type="range" min="5" max="45" step="1" value={pendAngleDeg} onChange={(e) => setPendAngleDeg(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              )}

              {simMode === 'projectile' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Projectile Kinematics</h3>
                  <div className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 space-y-1">
                    <p>Max Height H = {projMaxH.toFixed(2)} m</p>
                    <p>Horizontal Range R = {projRange.toFixed(2)} m</p>
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Initial Speed (u)</span>
                      <span className="font-mono tabular-nums">{projSpeed} m/s</span>
                    </label>
                    <input type="range" min="10" max="60" step="1" value={projSpeed} onChange={(e) => setProjSpeed(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Launch Angle (θ)</span>
                      <span className="font-mono tabular-nums">{projAngleDeg}°</span>
                    </label>
                    <input type="range" min="10" max="80" step="1" value={projAngleDeg} onChange={(e) => setProjAngleDeg(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Gravity (g)</span>
                      <span className="font-mono tabular-nums">{gravity.toFixed(2)} m/s²</span>
                    </label>
                    <input type="range" min="1.6" max="20" step="0.2" value={gravity} onChange={(e) => setGravity(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              )}

              {simMode === 'circuit' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Ohm’s Law & DC Network</h3>
                  <div className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 space-y-1">
                    <p>Equivalent R_eq = {req.toFixed(2)} Ω</p>
                    <p>Current I = V / R_eq = {currentA.toFixed(2)} A</p>
                    <p>Power P = V · I = {(voltage * currentA).toFixed(2)} W</p>
                  </div>
                  <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    <button onClick={() => setCircuitType('series')} className={`flex-1 py-1 text-xs font-medium rounded ${circuitType === 'series' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>Series</button>
                    <button onClick={() => setCircuitType('parallel')} className={`flex-1 py-1 text-xs font-medium rounded ${circuitType === 'parallel' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>Parallel</button>
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>EMF Voltage (V)</span>
                      <span className="font-mono tabular-nums">{voltage} V</span>
                    </label>
                    <input type="range" min="1" max="24" step="1" value={voltage} onChange={(e) => setVoltage(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Resistor R₁</span>
                      <span className="font-mono tabular-nums">{r1} Ω</span>
                    </label>
                    <input type="range" min="1" max="20" step="1" value={r1} onChange={(e) => setR1(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Resistor R₂</span>
                      <span className="font-mono tabular-nums">{r2} Ω</span>
                    </label>
                    <input type="range" min="1" max="20" step="1" value={r2} onChange={(e) => setR2(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              )}

              {simMode === 'interference' && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Young’s Double-Slit Interference</h3>
                  <p className="font-mono text-xs bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                    Fringe Width β = λD / d = <strong>{fringeMm.toFixed(2)} mm</strong>
                  </p>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Wavelength (λ)</span>
                      <span className="font-mono tabular-nums">{wavelengthNm} nm</span>
                    </label>
                    <input type="range" min="400" max="700" step="5" value={wavelengthNm} onChange={(e) => setWavelengthNm(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Slit Separation (d)</span>
                      <span className="font-mono tabular-nums">{slitSepMm.toFixed(2)} mm</span>
                    </label>
                    <input type="range" min="0.15" max="1.0" step="0.05" value={slitSepMm} onChange={(e) => setSlitSepMm(Number(e.target.value))} className="w-full" />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      <span>Screen Distance (D)</span>
                      <span className="font-mono tabular-nums">{screenDistM.toFixed(2)} m</span>
                    </label>
                    <input type="range" min="0.5" max="3.0" step="0.1" value={screenDistM} onChange={(e) => setScreenDistM(Number(e.target.value))} className="w-full" />
                  </div>
                </div>
              )}

              <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                <button
                  onClick={() => recordCurrentReading(simMode)}
                  className="w-full px-3.5 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700"
                >
                  Record Emulation Reading ({readings.length} saved)
                </button>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Recorded readings sync straight to the ACSEE Observation Table for linear gradient calculation & PDF export.
                </p>
              </div>
            </div>
          </div>

          {readings.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Live Emulation Observation Table & Gradient ({readings.length} Trials)
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setReadings([])}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Clear Table
                  </button>
                  <button
                    onClick={exportPracticalReportPdf}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-700 text-white rounded-lg hover:bg-teal-800"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export Practical PDF
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 font-medium">Trial</th>
                      <th className="py-2 pr-3 font-medium">{readings[0].xLabel}</th>
                      <th className="py-2 pr-3 font-medium">{readings[0].yLabel}</th>
                      <th className="py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs tabular-nums text-slate-800 dark:text-slate-200">
                    {readings.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-3">#{r.trial}</td>
                        <td className="py-2 pr-3">{r.xValue}</td>
                        <td className="py-2 pr-3">{r.yValue}</td>
                        <td className="py-2 font-sans text-slate-600 dark:text-slate-400">{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {regression && (
                <div className="p-3 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-900 rounded-lg font-mono text-xs text-sky-950 dark:text-sky-200">
                  Computed Linear Fit: Slope (Gradient) = <strong>{regression.slope.toFixed(4)}</strong> · Y-Intercept ={' '}
                  <strong>{regression.intercept.toFixed(4)}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {subTab === 'calculator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-slate-900 text-white rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-sky-400" />
                <span className="text-sm font-semibold">ACSEE Scientific Calculator</span>
              </div>
              <button
                onClick={() => setAngleMode((m) => (m === 'DEG' ? 'RAD' : 'DEG'))}
                className="px-2.5 py-1 text-xs font-mono bg-slate-800 border border-slate-700 rounded text-sky-300"
              >
                Mode: {angleMode}
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-1 text-right">
              <input
                type="text"
                value={calcExpr}
                onChange={(e) => setCalcExpr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') evaluateCalc();
                }}
                placeholder="Enter expression e.g. sin(30) + sqrt(144)"
                className="w-full bg-transparent text-right font-mono text-sm text-slate-300 focus:outline-none"
              />
              <p className="font-mono text-3xl font-semibold text-white tabular-nums">{calcResult}</p>
            </div>

            <div className="grid grid-cols-5 gap-2 font-mono text-xs">
              {[
                ['sin(', 'sin'],
                ['cos(', 'cos'],
                ['tan(', 'tan'],
                ['log(', 'log'],
                ['ln(', 'ln'],
                ['asin(', 'sin⁻¹'],
                ['acos(', 'cos⁻¹'],
                ['atan(', 'tan⁻¹'],
                ['sqrt(', '√'],
                ['^', 'x^y'],
                ['(', '('],
                [')', ')'],
                ['π', 'π'],
                ['E', 'e'],
                ['!', 'n!'],
                ['7', '7'],
                ['8', '8'],
                ['9', '9'],
                ['/', '÷'],
                ['CLEAR', 'AC'],
                ['4', '4'],
                ['5', '5'],
                ['6', '6'],
                ['*', '×'],
                ['BACK', 'DEL'],
                ['1', '1'],
                ['2', '2'],
                ['3', '3'],
                ['-', '−'],
                ['^2', 'x²'],
                ['0', '0'],
                ['.', '.'],
                ['e-', '×10⁻'],
                ['+', '+'],
                ['EVAL', '='],
              ].map(([token, label]) => (
                <button
                  key={label}
                  onClick={() => {
                    if (token === 'CLEAR') {
                      setCalcExpr('');
                      setCalcResult('0');
                    } else if (token === 'BACK') {
                      setCalcExpr((p) => p.slice(0, -1));
                    } else if (token === 'EVAL') {
                      evaluateCalc();
                    } else {
                      appendCalc(token);
                    }
                  }}
                  className={`py-3 rounded-lg font-medium transition-colors ${
                    token === 'EVAL'
                      ? 'bg-sky-600 hover:bg-sky-500 text-white'
                      : token === 'CLEAR'
                        ? 'bg-rose-900/60 hover:bg-rose-800 text-rose-200'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Physics & Math Constants (Click to Insert)
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {PHYSICS_CONSTANTS.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => appendCalc(c.value)}
                    className="p-2.5 text-left border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <p className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {c.label} = {c.value}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{c.unit}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Calculation Tape</h3>
              {calcHistory.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Previous evaluations will appear here.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                  {calcHistory.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => setCalcExpr(h.expr)}
                      className="w-full py-2 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/70"
                    >
                      <span className="text-slate-600 dark:text-slate-400 truncate pr-3">{h.expr}</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        = {h.res}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
