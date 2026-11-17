import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Box,
  Camera,
  FileCheck2,
  Image as ImageIcon,
  IndianRupee,
  Leaf,
  MapPin,
  Moon,
  Play,
  Plus,
  Recycle,
  Scale,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import React, { useMemo, useState } from 'react';
import collectorImg from '../assets/images/collector_weighbridge_1794898241505.jpg';
import heroPoster from '../assets/images/hero_ewaste_hub_1794898241189.jpg';
import recyclerImg from '../assets/images/recycler_facility_1794898242037.jpg';
import { useApp } from '../context/AppContext.tsx';
import { formatINR } from '../shared/format.ts';
import type { LanguageCode } from '../shared/types.ts';
import { AnimatedNumber, RevealBlock, TiltCard3D } from './MotionPrimitives.tsx';
import {
  MATERIAL_3D_LIST,
  Weighbridge3DScene,
  type Material3DKey,
} from './Weighbridge3DScene.tsx';

interface LandingPageProps {
  onOpenAuth: (defaultRole?: 'COLLECTOR' | 'RECYCLER') => void;
  onOpenVerifySample: (receiptId: string) => void;
  onReplayIntro?: () => void;
}

interface CustomEstimatorItem {
  id: string;
  name: string;
  ratePerKg: number;
  co2Factor: number;
  model3d: Material3DKey;
}

const MATERIAL_CATEGORY_HINTS: Record<Material3DKey, string[]> = {
  copper: ['copper', 'wire', 'cable'],
  pcb: ['pcb', 'circuit', 'board'],
  aluminium: ['alum'],
  battery: ['batter'],
};

function infer3dModelForName(name: string): Material3DKey {
  const lower = name.toLowerCase();
  if (lower.includes('batter') || lower.includes('cell') || lower.includes('ups')) return 'battery';
  if (lower.includes('pcb') || lower.includes('circuit') || lower.includes('mobile') || lower.includes('computer') || lower.includes('server')) return 'pcb';
  if (lower.includes('alum') || lower.includes('steel') || lower.includes('iron') || lower.includes('crt') || lower.includes('frame')) return 'aluminium';
  return 'copper';
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  onOpenVerifySample,
  onReplayIntro,
}) => {
  const { categories, language, setLanguage, theme, toggleTheme, t } = useApp();
  const [heroStageMode, setHeroStageMode] = useState<'3d' | 'photo'>('3d');
  const [selectedMaterial, setSelectedMaterial] = useState<Material3DKey>('copper');
  const [calcWeightKg, setCalcWeightKg] = useState<number>(18);
  const [customItems, setCustomItems] = useState<CustomEstimatorItem[]>([]);
  const [activeCustomId, setActiveCustomId] = useState<string | null>(null);
  const [showAddItemForm, setShowAddItemForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemRate, setNewItemRate] = useState('');
  const [newItemCo2, setNewItemCo2] = useState('2.5');
  const [newItemModel3d, setNewItemModel3d] = useState<Material3DKey>('copper');
  const [addItemError, setAddItemError] = useState<string | null>(null);

  const activeCustomItem = useMemo(
    () => customItems.find((item) => item.id === activeCustomId) ?? null,
    [customItems, activeCustomId]
  );

  const quickPickCategories = useMemo(() => {
    const defaultHints = Object.values(MATERIAL_CATEGORY_HINTS).flat();
    return categories.filter((c) => {
      const lower = c.name.toLowerCase();
      const isDefault = defaultHints.some((h) => lower.includes(h));
      const alreadyAdded = customItems.some(
        (item) => item.name.toLowerCase() === lower
      );
      return !isDefault && !alreadyAdded;
    });
  }, [categories, customItems]);

  const activeMaterialData = useMemo(() => {
    if (activeCustomItem) {
      return {
        key: activeCustomItem.model3d,
        shortLabel: activeCustomItem.name,
        displayName: activeCustomItem.name,
        ratePerKg: activeCustomItem.ratePerKg,
        co2Factor: activeCustomItem.co2Factor,
        minEst: Math.round(calcWeightKg * activeCustomItem.ratePerKg * 0.9),
        maxEst: Math.round(calcWeightKg * activeCustomItem.ratePerKg * 1.1),
        co2Saved: Number((calcWeightKg * activeCustomItem.co2Factor).toFixed(1)),
      };
    }

    const meta =
      MATERIAL_3D_LIST.find((m) => m.key === selectedMaterial) ?? MATERIAL_3D_LIST[0];
    const hints = MATERIAL_CATEGORY_HINTS[selectedMaterial];
    const matchedCat = categories.find((c) =>
      hints.some((h) => c.name.toLowerCase().includes(h))
    );
    const ratePerKg = matchedCat?.referenceRatePerKg || meta.defaultRate;
    const co2Factor = matchedCat?.co2FactorPerKg || meta.co2Factor;
    const displayName = matchedCat
      ? language === 'hi'
        ? matchedCat.nameHi
        : language === 'kn'
          ? matchedCat.nameKn
          : matchedCat.name
      : meta.label;
    return {
      ...meta,
      displayName,
      ratePerKg,
      co2Factor,
      minEst: Math.round(calcWeightKg * ratePerKg * 0.9),
      maxEst: Math.round(calcWeightKg * ratePerKg * 1.1),
      co2Saved: Number((calcWeightKg * co2Factor).toFixed(1)),
    };
  }, [categories, language, selectedMaterial, calcWeightKg, activeCustomItem]);

  const handleSelectBuiltInMaterial = (key: Material3DKey) => {
    setActiveCustomId(null);
    setSelectedMaterial(key);
    setHeroStageMode('3d');
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newItemName.trim();
    const parsedRate = Number(newItemRate);
    const parsedCo2 = Number(newItemCo2);
    if (!trimmedName) {
      setAddItemError('Please enter an item name.');
      return;
    }
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setAddItemError('Please enter a valid rate in ₹/kg.');
      return;
    }
    const created: CustomEstimatorItem = {
      id: `custom_${Date.now()}`,
      name: trimmedName,
      ratePerKg: Math.round(parsedRate),
      co2Factor: Number.isFinite(parsedCo2) && parsedCo2 >= 0 ? Number(parsedCo2.toFixed(1)) : 2.5,
      model3d: newItemModel3d,
    };
    setCustomItems((prev) => [...prev, created]);
    setActiveCustomId(created.id);
    setSelectedMaterial(created.model3d);
    setHeroStageMode('3d');
    setNewItemName('');
    setNewItemRate('');
    setNewItemCo2('2.5');
    setAddItemError(null);
    setShowAddItemForm(false);
  };

  const handleQuickAddCategory = (cat: (typeof categories)[number]) => {
    const label = language === 'hi' ? cat.nameHi : language === 'kn' ? cat.nameKn : cat.name;
    const model = infer3dModelForName(cat.name);
    const created: CustomEstimatorItem = {
      id: `custom_${cat.id}_${Date.now()}`,
      name: label,
      ratePerKg: cat.referenceRatePerKg || 120,
      co2Factor: cat.co2FactorPerKg || 2.5,
      model3d: model,
    };
    setCustomItems((prev) => [...prev, created]);
    setActiveCustomId(created.id);
    setSelectedMaterial(model);
    setHeroStageMode('3d');
    setAddItemError(null);
    setShowAddItemForm(false);
  };

  const handleRemoveCustomItem = (id: string) => {
    setCustomItems((prev) => prev.filter((item) => item.id !== id));
    if (activeCustomId === id) {
      setActiveCustomId(null);
    }
  };

  const steps = [
    { num: '01', title: 'Snap & weigh estimate', desc: 'Take up to 4 photos, confirm your GPS pickup area, and enter approximate kg per category.', icon: <Camera className="w-5 h-5 text-[#b04a17]" /> },
    { num: '02', title: 'Indicative rate range', desc: 'See a -10% to +10% range from local verified recyclers or admin reference rates.', icon: <IndianRupee className="w-5 h-5 text-[#b04a17]" /> },
    { num: '03', title: 'Compare net payouts', desc: 'Compare verified recyclers sorted by best net payout after transport, distance, or earliest slot.', icon: <MapPin className="w-5 h-5 text-[#b04a17]" /> },
    { num: '04', title: 'Book & lock rates', desc: 'Request a pickup or delivery slot. Phone numbers stay private until the recycler accepts.', icon: <ShieldCheck className="w-5 h-5 text-[#b04a17]" /> },
    { num: '05', title: '4-digit code handover', desc: 'Recycler weighs each item on-site, enters your 4-digit code, and both sides confirm.', icon: <Scale className="w-5 h-5 text-[#b04a17]" /> },
    { num: '06', title: 'Cash or UPI confirm', desc: 'Recycler marks cash or enters UPI reference. Nothing closes until you tap Received.', icon: <BadgeCheck className="w-5 h-5 text-[#b04a17]" /> },
    { num: '07', title: 'QR receipt & ledger', desc: 'Download an HMAC-signed PDF weighbridge slip and track monthly earnings & CO₂ saved.', icon: <FileCheck2 className="w-5 h-5 text-[#b04a17]" /> },
  ];

  return (
    <div className="min-h-screen bg-[#f3f6f4] text-[#14201a] dark:bg-[#0d1512] dark:text-[#ecf2ee]">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-emerald-950/60 bg-[#f3f6f4]/95 dark:bg-[#0d1512]/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-[#14201a] dark:text-[#ecf2ee] whitespace-nowrap shrink-0"
          >
            {t('brand')}
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#estimator" className="hover:text-[#b04a17] transition-colors whitespace-nowrap shrink-0">
              Estimator
            </a>
            <a href="#how-it-works" className="hover:text-[#b04a17] transition-colors whitespace-nowrap shrink-0">
              {t('nav.howItWorks')}
            </a>
            <a href="#categories" className="hover:text-[#b04a17] transition-colors whitespace-nowrap shrink-0">
              {t('nav.categories')}
            </a>
            <a href="#for-recyclers" className="hover:text-[#b04a17] transition-colors whitespace-nowrap shrink-0">
              {t('nav.forRecyclers')}
            </a>
            <button
              type="button"
              onClick={() => onOpenVerifySample('KWC-2026-0001')}
              className="hover:text-[#b04a17] transition-colors whitespace-nowrap shrink-0"
            >
              Verify Receipt
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('COLLECTOR')}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-[#b04a17] hover:bg-[#943b10] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              {t('nav.signIn')}
            </button>
          </div>
        </div>
      </header>

      {/* Utility Bar below header for Language & Theme */}
      <div className="border-b border-slate-200/60 dark:border-emerald-950/40 bg-white/70 dark:bg-[#15201b]/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-slate-600 dark:text-slate-300">
            Mangaluru Pilot · English · हिन्दी · ಕನ್ನಡ
          </span>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-slate-200/70 dark:bg-[#0d1512] p-0.5" role="group" aria-label="Language switcher">
              {(['en', 'hi', 'kn'] as LanguageCode[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLanguage(code)}
                  className={`min-h-[36px] px-2.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                    language === code
                      ? 'bg-[#b04a17] text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:text-[#14201a]'
                  }`}
                >
                  {code === 'en' ? 'EN' : code === 'hi' ? 'हिं' : 'ಕನ್ನಡ'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle light or dark theme"
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#15201b] text-slate-700 dark:text-slate-200"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Hero Split */}
      <section id="top" className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 min-w-0 flex flex-col justify-center"
          >
            <p className="text-xs font-mono tracking-wide text-[#b04a17] font-semibold mb-3">
              Informal Collectors · Authorised Recyclers
            </p>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-balance leading-[1.12] text-[#14201a] dark:text-[#ecf2ee]">
              {t('hero.title')}
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              {t('hero.subtitle')}
            </p>

            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => onOpenAuth('COLLECTOR')}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-[#b04a17] hover:bg-[#943b10] active:scale-[0.99] text-white font-semibold text-base inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap"
              >
                <span>{t('hero.ctaCollector')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('RECYCLER')}
                className="min-h-[48px] px-6 py-3 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#15201b] hover:bg-slate-50 dark:hover:bg-[#1b2923] active:scale-[0.99] font-semibold text-base inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap"
              >
                <Recycle className="w-4 h-4 text-[#b04a17]" />
                <span>{t('hero.ctaRecycler')}</span>
              </button>
            </div>

            <div className="mt-6 rounded-xl border border-amber-300/70 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3 text-xs text-amber-950 dark:text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-400" />
              <span>{t('hero.disclaimer')}</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 min-w-0 flex flex-col gap-3"
          >
            <div className="flex-1 min-h-[300px] sm:min-h-[360px] rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-[#0c1713] overflow-hidden relative">
              {heroStageMode === '3d' ? (
                <Weighbridge3DScene
                  selectedMaterial={selectedMaterial}
                  onSelectMaterial={handleSelectBuiltInMaterial}
                  weightKg={calcWeightKg}
                  ratePerKg={activeMaterialData.ratePerKg}
                  displayLabel={activeCustomItem?.name}
                />
              ) : (
                <div className="h-full min-h-[300px] sm:min-h-[360px] relative">
                  <img
                    src={heroPoster}
                    alt="Authorised e-waste sorting facility and digital weighbridge scale"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-5 text-white">
                    <div className="font-mono text-xs tabular-nums text-amber-300">
                      Sample Weighbridge Slip · KWC-2026-0001
                    </div>
                    <div className="text-sm font-medium mt-1">
                      Declared vs. Weighed kg · HMAC-SHA256 Signed · Two-Sided Payment Confirmation
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Stage Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="inline-flex rounded-lg bg-slate-200/70 dark:bg-[#15201b] p-0.5 border border-slate-200 dark:border-emerald-950/60" role="group" aria-label="Hero stage view switcher">
                <button
                  type="button"
                  onClick={() => setHeroStageMode('3d')}
                  className={`min-h-[36px] px-3 rounded-md font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    heroStageMode === '3d'
                      ? 'bg-[#b04a17] text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:text-[#14201a]'
                  }`}
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>3D Weighbridge</span>
                </button>
                <button
                  type="button"
                  onClick={() => setHeroStageMode('photo')}
                  className={`min-h-[36px] px-3 rounded-md font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    heroStageMode === 'photo'
                      ? 'bg-[#b04a17] text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:text-[#14201a]'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Facility Photo</span>
                </button>
              </div>
              {onReplayIntro && (
                <button
                  type="button"
                  onClick={onReplayIntro}
                  className="min-h-[36px] px-3 rounded-lg border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#15201b] hover:bg-slate-50 dark:hover:bg-[#1b2923] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5 text-[#b04a17]" />
                  <span>Watch Intro</span>
                </button>
              )}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Live 3D-Synced Scrap Value & Carbon Impact Estimator */}
      <section id="estimator" className="max-w-7xl mx-auto px-4 sm:px-6 pb-10">
        <RevealBlock>
          <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5 space-y-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                    Interactive Value & CO₂ Estimator
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    Select a material and adjust lot weight to inspect it live on the 3D weighbridge above.
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estimator category tabs">
                  {MATERIAL_3D_LIST.map((mat) => (
                    <button
                      key={mat.key}
                      type="button"
                      onClick={() => handleSelectBuiltInMaterial(mat.key)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        !activeCustomItem && selectedMaterial === mat.key
                          ? 'bg-[#b04a17] text-white'
                          : 'bg-slate-100 dark:bg-[#0d1512] text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-[#1b2923]'
                      }`}
                    >
                      {mat.shortLabel}
                    </button>
                  ))}

                  {customItems.map((item) => {
                    const isSelected = activeCustomId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`inline-flex items-center rounded-lg text-xs font-semibold transition-colors ${
                          isSelected
                            ? 'bg-[#b04a17] text-white'
                            : 'bg-slate-100 dark:bg-[#0d1512] text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveCustomId(item.id);
                            setSelectedMaterial(item.model3d);
                            setHeroStageMode('3d');
                          }}
                          className="min-h-[38px] pl-3 pr-1.5 py-1.5 whitespace-nowrap max-w-[160px] truncate"
                        >
                          {item.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomItem(item.id)}
                          aria-label={`Remove ${item.name}`}
                          className="min-h-[38px] px-2 inline-flex items-center justify-center rounded-r-lg hover:bg-black/15 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setShowAddItemForm((prev) => !prev);
                      setAddItemError(null);
                    }}
                    aria-expanded={showAddItemForm}
                    aria-label="Add custom item to estimator"
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                      showAddItemForm
                        ? 'border-[#b04a17] bg-[#b04a17]/10 text-[#b04a17]'
                        : 'border-dashed border-slate-300 dark:border-emerald-800 bg-transparent text-slate-700 dark:text-slate-200 hover:border-[#b04a17] hover:text-[#b04a17]'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>

                {showAddItemForm && (
                  <form
                    onSubmit={handleAddCustomItem}
                    className="rounded-xl border border-slate-200 dark:border-emerald-900/70 bg-[#f8faf9] dark:bg-[#0d1512] p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#14201a] dark:text-[#ecf2ee]">
                        Add Custom Item or Category
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddItemForm(false)}
                        aria-label="Close add item form"
                        className="text-slate-500 hover:text-[#14201a] dark:hover:text-white p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {quickPickCategories.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Quick pick from catalog:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {quickPickCategories.map((cat) => (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => handleQuickAddCategory(cat)}
                              className="min-h-[32px] px-2.5 py-1 rounded-md border border-slate-200 dark:border-emerald-900/60 bg-white dark:bg-[#15201b] hover:border-[#b04a17] text-[11px] font-medium transition-colors"
                            >
                              + {cat.name} (₹{cat.referenceRatePerKg}/kg)
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="sm:col-span-2">
                        <label htmlFor="custom-item-name" className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                          Item Name
                        </label>
                        <input
                          id="custom-item-name"
                          type="text"
                          value={newItemName}
                          onChange={(e) => setNewItemName(e.target.value)}
                          placeholder="e.g. Brass Valves, Laptop Motherboards, Solar Inverter"
                          maxLength={50}
                          className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-white dark:bg-[#15201b] text-xs"
                        />
                      </div>

                      <div>
                        <label htmlFor="custom-item-rate" className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                          Rate (₹ / kg)
                        </label>
                        <input
                          id="custom-item-rate"
                          type="number"
                          min={1}
                          max={100000}
                          step="1"
                          value={newItemRate}
                          onChange={(e) => setNewItemRate(e.target.value)}
                          placeholder="e.g. 420"
                          className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-white dark:bg-[#15201b] text-xs font-mono tabular-nums"
                        />
                      </div>

                      <div>
                        <label htmlFor="custom-item-co2" className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                          CO₂ Saved (kg / kg)
                        </label>
                        <input
                          id="custom-item-co2"
                          type="number"
                          min={0}
                          max={50}
                          step="0.1"
                          value={newItemCo2}
                          onChange={(e) => setNewItemCo2(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-white dark:bg-[#15201b] text-xs font-mono tabular-nums"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor="custom-item-model" className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                          3D Weighbridge Visual
                        </label>
                        <select
                          id="custom-item-model"
                          value={newItemModel3d}
                          onChange={(e) => setNewItemModel3d(e.target.value as Material3DKey)}
                          className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-900/70 bg-white dark:bg-[#15201b] text-xs"
                        >
                          <option value="copper">Metal Coils & Cables</option>
                          <option value="pcb">Circuit Boards & Electronics</option>
                          <option value="aluminium">Alloy Frames & Casings</option>
                          <option value="battery">Batteries & Power Cells</option>
                        </select>
                      </div>
                    </div>

                    {addItemError && (
                      <p className="text-xs text-red-600 dark:text-red-400">{addItemError}</p>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddItemForm(false)}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-900/60 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="min-h-[38px] px-4 py-1.5 rounded-lg bg-[#b04a17] hover:bg-[#943b10] text-white text-xs font-semibold whitespace-nowrap"
                      >
                        Add to Estimator
                      </button>
                    </div>
                  </form>
                )}

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <label htmlFor="landing-kg-slider" className="font-medium text-slate-700 dark:text-slate-300">
                      Estimated Lot Weight ({activeMaterialData.displayName})
                    </label>
                    <span className="font-mono font-bold text-sm tabular-nums text-[#b04a17]">
                      {calcWeightKg} kg
                    </span>
                  </div>
                  <input
                    id="landing-kg-slider"
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={calcWeightKg}
                    onChange={(e) => setCalcWeightKg(Number(e.target.value))}
                    className="w-full accent-[#b04a17] cursor-pointer h-2"
                  />
                  <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500 mt-1">
                    <span>1 kg</span>
                    <span>50 kg</span>
                    <span>100 kg</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-200/80 dark:border-emerald-950/60 bg-[#f8faf9] dark:bg-[#0d1512] p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Indicative Range (±10%)</div>
                  <div className="mt-1.5 font-mono font-bold text-xl sm:text-2xl tabular-nums text-[#14201a] dark:text-[#ecf2ee]">
                    ₹<AnimatedNumber value={activeMaterialData.minEst} /> – ₹<AnimatedNumber value={activeMaterialData.maxEst} />
                  </div>
                  <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Ref. ₹{activeMaterialData.ratePerKg}/kg
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 dark:border-emerald-950/60 bg-[#f8faf9] dark:bg-[#0d1512] p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">CO₂ Emissions Prevented</div>
                  <div className="mt-1.5 font-mono font-bold text-xl sm:text-2xl tabular-nums text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1.5">
                    <Leaf className="w-4 h-4 shrink-0" />
                    <span>
                      <AnimatedNumber
                        value={activeMaterialData.co2Saved}
                        format={(v) => v.toFixed(1)}
                      />{' '}
                      kg
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {activeMaterialData.co2Factor} kg CO₂e / kg
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200/80 dark:border-emerald-950/60 bg-[#f8faf9] dark:bg-[#0d1512] p-4 flex flex-col justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Collector Commission</div>
                    <div className="mt-1 font-mono font-bold text-xl tabular-nums text-[#b04a17]">
                      ₹0 (0%)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenAuth('COLLECTOR')}
                    className="min-h-[40px] w-full px-3 py-2 rounded-lg bg-[#b04a17] hover:bg-[#943b10] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <span>Find Recyclers</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </RevealBlock>
      </section>

      {/* 7-Step Workflow */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 border-t border-slate-200/80 dark:border-emerald-950/60">
        <RevealBlock className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">How Kabadiwala Connect works in 7 steps</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Built for 360px Android screens, patchy signals, and transparent handovers.
            </p>
          </div>
        </RevealBlock>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((s, idx) => (
            <RevealBlock key={s.num} delay={Math.min(idx * 0.04, 0.24)}>
              <TiltCard3D className="h-full rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[#b04a17]">{s.num}</span>
                  {s.icon}
                </div>
                <h3 className="text-base font-semibold">{s.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{s.desc}</p>
              </TiltCard3D>
            </RevealBlock>
          ))}
        </div>
      </section>

      {/* Categories & Indicative Reference Rates */}
      <section id="categories" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 border-t border-slate-200/80 dark:border-emerald-950/60">
        <RevealBlock className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Supported e-waste categories</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              Indicative admin reference rates. Actual quotes come from verified local recyclers.
            </p>
          </div>
        </RevealBlock>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat, idx) => (
            <RevealBlock key={cat.id} delay={Math.min(idx * 0.03, 0.21)}>
              <TiltCard3D className="h-full rounded-xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-base leading-snug">
                      {language === 'hi' ? cat.nameHi : language === 'kn' ? cat.nameKn : cat.name}
                    </h3>
                    {cat.hazardous && (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 text-xs font-semibold shrink-0">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Hazard
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                    CO₂ saved: {cat.co2FactorPerKg} kg / kg
                  </p>
                </div>
                <div className="pt-2 weighbridge-divider flex items-baseline justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Ref. Rate</span>
                  <span className="font-mono font-bold text-lg tabular-nums text-[#b04a17]">
                    {cat.referenceRatePerKg ? `${formatINR(cat.referenceRatePerKg)}/kg` : '—'}
                  </span>
                </div>
              </TiltCard3D>
            </RevealBlock>
          ))}
        </div>
      </section>

      {/* For Collectors & Recyclers Split */}
      <section id="for-recyclers" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 border-t border-slate-200/80 dark:border-emerald-950/60">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <RevealBlock>
            <TiltCard3D maxTiltDeg={4} className="h-full rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] flex flex-col">
              <img
                src={collectorImg}
                alt="Local scrap collector beside digital scale and sorted copper cables"
                referrerPolicy="no-referrer"
                className="w-full h-56 object-cover"
              />
              <div className="p-6 flex-1 flex flex-col justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">For Collectors (Kabadiwalas)</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                    Know indicative value before travelling, compare net payouts after delivery cost, keep your mobile number private until booking acceptance, and download weighbridge receipts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenAuth('COLLECTOR')}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#b04a17] hover:bg-[#943b10] text-white font-semibold text-sm self-start inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <span>Start as Collector</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </TiltCard3D>
          </RevealBlock>

          <RevealBlock delay={0.08}>
            <TiltCard3D maxTiltDeg={4} className="h-full rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] flex flex-col">
              <img
                src={recyclerImg}
                alt="Authorised e-waste recycling plant sorting PCBs and aluminum"
                referrerPolicy="no-referrer"
                className="w-full h-56 object-cover"
              />
              <div className="p-6 flex-1 flex flex-col justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold">For Authorised Recyclers & Refurbishers</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                    Set per-category buying rates, radius, minimum kg, and pickup windows. Receive pre-categorized e-waste lots, verify handovers with a 4-digit code, and export clean CSV logs.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenAuth('RECYCLER')}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-300 dark:border-emerald-900/60 bg-slate-50 dark:bg-[#0d1512] hover:bg-slate-100 dark:hover:bg-[#192822] font-semibold text-sm self-start inline-flex items-center gap-2 whitespace-nowrap"
                >
                  <span>Register Facility</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </TiltCard3D>
          </RevealBlock>
        </div>
      </section>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
          <div className="space-y-1">
            <div className="font-semibold text-sm text-[#14201a] dark:text-[#ecf2ee]">{t('brand')}</div>
            <p>{t('hero.disclaimer')}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenVerifySample('KWC-2026-0001')}
            className="font-mono underline hover:text-[#b04a17] whitespace-nowrap"
          >
            Verify Receipt #KWC-2026-0001
          </button>
        </div>
      </footer>
    </div>
  );
};
