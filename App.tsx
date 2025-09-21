
import React, { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import { Crime, StopSearch, CrimeCategory, Insight, PredictiveHotspot, ModalState, SortConfig } from './types';
import * as policeApi from './services/policeApi';
import * as geminiService from './services/geminiService';
import CrimeMap from './components/CrimeMap';
import Modal from './components/Modal';
import CollapsibleSection from './components/CollapsibleSection';
import moment from 'moment';

const getNestedValue = (obj: any, path: string): any => {
    if (!path) return obj;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

const MilitaryButton: React.FC<{ onClick?: () => void; children: React.ReactNode; disabled?: boolean; className?: string }> = ({ onClick, children, disabled, className }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`rounded-[0.15rem] p-2 px-3.5 font-bold uppercase tracking-wider shadow-[1.5px_1.5px_3px_rgba(0,0,0,0.5),_0_0_2px_var(--accent-primary)] transition-all duration-150 border-2 border-solid border-[#FFD700] inline-flex items-center justify-center gap-1.5 text-sm text-[#FFD700] bg-gradient-to-b from-[#21262D] to-[#161B22] hover:from-[#161B22] hover:to-[#21262D] hover:shadow-[1px_1px_1.5px_rgba(0,0,0,0.3),_0_0_4px_var(--accent-primary)] hover:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        style={{ textShadow: '0.5px 0.5px 1px rgba(0,0,0,0.5), 0 0 1px var(--accent-primary)' }}
    >
        {children}
    </button>
);

type ModalAction =
    | { type: 'OPEN_MODAL'; payload: { modal: keyof ModalState; content?: React.ReactNode } }
    | { type: 'CLOSE_MODAL' }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_CONTENT'; payload: React.ReactNode };

const initialModalState: { modal: ModalState; content: React.ReactNode; isLoading: boolean } = {
    modal: { briefing: false, trend: false, insights: false, predictive: false },
    content: '',
    isLoading: false,
};

function modalReducer(state: typeof initialModalState, action: ModalAction) {
    switch (action.type) {
        case 'OPEN_MODAL':
            return { ...state, modal: { ...initialModalState.modal, [action.payload.modal]: true }, isLoading: true, content: action.payload.content || '' };
        case 'CLOSE_MODAL':
            return { ...state, modal: initialModalState.modal };
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };
        case 'SET_CONTENT':
            return { ...state, content: action.payload, isLoading: false };
        default: return state;
    }
}

const App: React.FC = () => {
    const [allCrimes, setAllCrimes] = useState<Crime[]>([]);
    const [filteredCrimes, setFilteredCrimes] = useState<Crime[]>([]);
    const [allStopSearches, setAllStopSearches] = useState<StopSearch[]>([]);
    const [crimeCategories, setCrimeCategories] = useState<CrimeCategory[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [selectedCrimeId, setSelectedCrimeId] = useState<string | null>(null);
    const [selectedStopSearch, setSelectedStopSearch] = useState<StopSearch | null>(null);
    
    const [notification, setNotification] = useState('Initializing...');
    const [isLoading, setIsLoading] = useState(true);

    const [isDensityHeatmapVisible, setDensityHeatmapVisible] = useState(true);
    const [isRecencyHeatmapVisible, setRecencyHeatmapVisible] = useState(false);
    const [isInsightsVisible, setInsightsVisible] = useState(false);
    const [isPredictiveHotspotsVisible, setPredictiveHotspotsVisible] = useState(false);
    const [isMapEffectEnabled, setMapEffectEnabled] = useState(true);

    const [insights, setInsights] = useState<Insight[]>([]);
    const [predictiveHotspots, setPredictiveHotspots] = useState<PredictiveHotspot[]>([]);
    
    const [modal, dispatchModal] = useReducer(modalReducer, initialModalState);
    
    const [crimeSortConfig, setCrimeSortConfig] = useState<SortConfig>({ key: 'month', direction: 'desc' });
    const [stopSearchSortConfig, setStopSearchSortConfig] = useState<SortConfig>({ key: 'datetime', direction: 'desc' });

    const handleItemSelection = useCallback((type: 'crime' | 'stopSearch' | null, item?: Crime | StopSearch) => {
        if (type === 'crime' && item) {
            setSelectedCrimeId((item as Crime).persistent_id || String((item as Crime).id));
            setSelectedStopSearch(null);
        } else if (type === 'stopSearch' && item) {
            setSelectedStopSearch(item as StopSearch);
            setSelectedCrimeId(null);
        } else { // This handles the null case for deselection
            setSelectedCrimeId(null);
            setSelectedStopSearch(null);
        }
        if (item) {
            document.getElementById('map-wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, []);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setNotification('Fetching latest data...');
        const dates = await policeApi.getAvailableCrimeDates();
        if (dates.length === 0) {
            setNotification('No recent data available from Police API.');
            setIsLoading(false);
            return;
        }

        const [crimes, stopSearches, categories] = await Promise.all([
            policeApi.fetchCrimeData(dates),
            policeApi.fetchStopAndSearchData(dates),
            policeApi.fetchCrimeCategories()
        ]);

        setAllCrimes(crimes);
        setAllStopSearches(stopSearches);
        if (crimeCategories.length === 0) { // Only set categories once
            setCrimeCategories(categories);
        }
        setNotification(`Updated! Data from ${moment(dates[dates.length - 1]).format('MMMM YYYY')} to ${moment(dates[0]).format('MMMM YYYY')}.`);
        setIsLoading(false);
    }, [crimeCategories.length]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 300000); // Update every 5 minutes
        return () => clearInterval(interval);
    }, [fetchData]);

    useEffect(() => {
        let newFilteredCrimes = allCrimes;
        if (selectedCategory !== 'all') {
            newFilteredCrimes = allCrimes.filter(crime => crime.category === selectedCategory);
        }
        setFilteredCrimes(newFilteredCrimes);
    }, [allCrimes, selectedCategory]);

    const handleAIFeature = useCallback(async (
        modalKey: keyof ModalState,
        apiCall: () => Promise<any>,
        onSuccess: (data: any) => React.ReactNode
    ) => {
        dispatchModal({ type: 'OPEN_MODAL', payload: { modal: modalKey } });
        try {
            const result = await apiCall();
            dispatchModal({ type: 'SET_CONTENT', payload: onSuccess(result) });
        } catch (e) {
            const message = e instanceof Error ? e.message : 'An unknown error occurred.';
            dispatchModal({ type: 'SET_CONTENT', payload: <div className="text-red-400">{message}</div> });
        }
    }, []);

    const handleSummarizeTrends = () => handleAIFeature(
        'trend',
        () => geminiService.summarizeCrimeTrends(filteredCrimes),
        (summary) => <div dangerouslySetInnerHTML={{ __html: summary.replace(/\n/g, '<br/>') }} />
    );

    const handleGenerateInsights = () => handleAIFeature(
        'insights',
        () => geminiService.generateCrimeInsights(filteredCrimes),
        (insightData: Insight[]) => {
            setInsights(insightData);
            setInsightsVisible(true);
            return insightData.length > 0 ?
                <ul className="list-disc pl-5">{insightData.map((item, i) => <li key={i}><strong>{item.area}:</strong> {item.insight}</li>)}</ul> :
                'No insights could be generated from the current data.';
        }
    );

    const handleGeneratePredictiveHotspots = () => handleAIFeature(
        'predictive',
        () => geminiService.generatePredictiveHotspots(allCrimes),
        (hotspotData: PredictiveHotspot[]) => {
            setPredictiveHotspots(hotspotData);
            setPredictiveHotspotsVisible(true);
            return hotspotData.length > 0 ?
                <ul className="list-disc pl-5">{hotspotData.map((item, i) => <li key={i}><strong>{item.area} ({item.predictedCrimeType}):</strong> {item.reason}</li>)}</ul> :
                'No predictive hotspots could be generated.';
        }
    );
    
    const closeModal = () => dispatchModal({ type: 'CLOSE_MODAL' });

    const sortedCrimes = useMemo(() => {
        return [...filteredCrimes].sort((a, b) => {
            const valA = crimeSortConfig.key === 'month' ? moment(a.month).valueOf() : a.category;
            const valB = crimeSortConfig.key === 'month' ? moment(b.month).valueOf() : b.category;
            if (valA < valB) return crimeSortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return crimeSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredCrimes, crimeSortConfig]);

    const sortedStopSearches = useMemo(() => {
        return [...allStopSearches].sort((a, b) => {
            const valA = getNestedValue(a, stopSearchSortConfig.key) || '';
            const valB = getNestedValue(b, stopSearchSortConfig.key) || '';
            if (valA < valB) return stopSearchSortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return stopSearchSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [allStopSearches, stopSearchSortConfig]);

    const handleCrimeSort = (key: string) => {
        setCrimeSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };
    
    const handleStopSearchSort = (key: string) => {
        setStopSearchSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const stopSearchHeaders = [
        { label: 'Date', key: 'datetime' },
        { label: 'Type', key: 'type' },
        { label: 'Object', key: 'object_of_search' },
        { label: 'Gender', key: 'gender' },
        { label: 'Age', key: 'age_range' },
        { label: 'Ethnicity', key: 'self_defined_ethnicity' },
        { label: 'Outcome', key: 'outcome' },
        { label: 'Street', key: 'location.street.name' },
    ];


    return (
        <div className="container mx-auto bg-[#161B22] p-2 sm:p-2.5 md:p-3 rounded-lg shadow-[0_0_15px_rgba(0,0,0,0.8),_0_0_5px_var(--accent-primary),_inset_0_0_0_2px_var(--accent-primary),_inset_0_0_0_4px_var(--border-color),_inset_0_0_0_6px_var(--bg-dark)] border-4 border-solid border-[#FFD700] max-w-7xl">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                    <svg className="w-16 h-16 text-green-400" style={{filter: 'drop-shadow(0 0 5px #059669)'}} viewBox="0 0 100 100" fill="none" stroke="currentColor">
                         <defs>
                            <linearGradient id="radarSweepGradient" gradientUnits="userSpaceOnUse" x1="50" y1="50" x2="85.35" y2="14.65">
                                <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                                <stop offset="80%" stopColor="currentColor" stopOpacity="0.5" />
                                <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
                            </linearGradient>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                                <feMerge>
                                    <feMergeNode in="coloredBlur"/>
                                    <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                            </filter>
                        </defs>
                        <circle cx="50" cy="50" r="45" strokeWidth="3" opacity="0.9"/>
                        <circle cx="50" cy="50" r="30" strokeWidth="2" opacity="0.5"/>
                        <circle cx="50" cy="50" r="15" strokeWidth="1" opacity="0.3"/>
                        <line x1="50" y1="50" x2="50" y2="5" strokeWidth="4" strokeLinecap="round" stroke="url(#radarSweepGradient)" filter="url(#glow)">
                            <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4s" repeatCount="indefinite"/>
                        </line>
                        {/* Blips */}
                        <circle cx="65" cy="35" r="2" fill="currentColor" opacity="0">
                            <animate attributeName="opacity" values="0;1;0" dur="4s" begin="0.5s" repeatCount="indefinite" />
                        </circle>
                        <circle cx="30" cy="60" r="2" fill="currentColor" opacity="0">
                            <animate attributeName="opacity" values="0;1;0" dur="4s" begin="2.1s" repeatCount="indefinite" />
                        </circle>
                         <circle cx="70" cy="70" r="2.5" fill="currentColor" opacity="0">
                            <animate attributeName="opacity" values="0;1;0" dur="4s" begin="3.2s" repeatCount="indefinite" />
                        </circle>
                    </svg>
                    <h1 className="text-xl sm:text-4xl font-bold text-[#FFD700]" style={{textShadow: '0 0 3px rgba(255, 215, 0, 0.7)'}}>Doncaster Crime Activity</h1>
                </div>
            </header>

            {/* Notification and Update */}
            <div className="flex flex-col md:flex-row items-center justify-between mb-2 p-1.5 bg-[#21262D] border-2 border-solid border-[#4A5D6B] rounded-sm shadow-[0_0_5px_rgba(0,0,0,0.5)]">
                <div className="font-semibold text-xs mb-1 md:mb-0 text-[#FFD700]" style={{textShadow: '0 0 1px var(--accent-primary)'}}>{notification}</div>
                <MilitaryButton onClick={fetchData} disabled={isLoading}>Update Now</MilitaryButton>
            </div>
            
            {/* Controls */}
            <div className="mb-2">
                <label htmlFor="crimeCategoryFilter" className="block text-xs font-medium mb-0.5 text-[#FFD700]">Filter by Crime Category:</label>
                <select id="crimeCategoryFilter" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="mt-0.5 block w-full pl-1.5 pr-5 py-0.5 text-xs border focus:outline-none sm:text-sm bg-[#0D1117] text-[#E0E6ED] border-[#4A5D6B] rounded-sm shadow-[inset_0_0_3px_rgba(0,0,0,0.5)] focus:border-[#00BFFF] focus:shadow-[inset_0_0_3px_rgba(0,0,0,0.5),_0_0_5px_var(--accent-secondary)]">
                    <option value="all">All Categories</option>
                    {crimeCategories.map(cat => <option key={cat.url} value={cat.url}>{cat.name}</option>)}
                </select>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-1 mb-2">
                <MilitaryButton onClick={handleSummarizeTrends}>✨ Summarize</MilitaryButton>
                <MilitaryButton onClick={() => { setDensityHeatmapVisible(!isDensityHeatmapVisible); if(!isDensityHeatmapVisible) setRecencyHeatmapVisible(false); }} className={isDensityHeatmapVisible ? 'active-glow' : ''}>{isDensityHeatmapVisible ? 'Hide Density' : 'Show Density'}</MilitaryButton>
                <MilitaryButton onClick={() => { setRecencyHeatmapVisible(!isRecencyHeatmapVisible); if(!isRecencyHeatmapVisible) setDensityHeatmapVisible(false); }} className={isRecencyHeatmapVisible ? 'active-glow' : ''}>{isRecencyHeatmapVisible ? 'Hide Recency' : 'Show Recency'}</MilitaryButton>
                <MilitaryButton onClick={() => { insights.length > 0 ? setInsightsVisible(!isInsightsVisible) : handleGenerateInsights(); }} className={isInsightsVisible ? 'active-glow' : ''}>{isInsightsVisible ? 'Hide Insights' : 'Show Insights'}</MilitaryButton>
                <MilitaryButton onClick={() => setMapEffectEnabled(!isMapEffectEnabled)} className={isMapEffectEnabled ? '' : 'active-glow'}>{isMapEffectEnabled ? 'FX Off' : 'FX On'}</MilitaryButton>
                <MilitaryButton onClick={() => { predictiveHotspots.length > 0 ? setPredictiveHotspotsVisible(!isPredictiveHotspotsVisible) : handleGeneratePredictiveHotspots(); }} className={`${isPredictiveHotspotsVisible ? 'active-glow' : ''} ${modal.isLoading && modal.modal.predictive ? 'predictive-generating' : ''}`}>{isPredictiveHotspotsVisible ? 'Hide Hotspots' : '🔮 Predict'}</MilitaryButton>
            </div>

            {/* Map */}
            <div id="map-wrapper">
                <CrimeMap 
                    crimes={filteredCrimes} 
                    insights={insights}
                    predictiveHotspots={predictiveHotspots}
                    isDensityHeatmapVisible={isDensityHeatmapVisible}
                    isRecencyHeatmapVisible={isRecencyHeatmapVisible}
                    isInsightsVisible={isInsightsVisible}
                    isPredictiveHotspotsVisible={isPredictiveHotspotsVisible}
                    isMapEffectEnabled={isMapEffectEnabled}
                    onCrimeSelect={handleItemSelection}
                    selectedCrimeId={selectedCrimeId}
                    selectedStopSearch={selectedStopSearch}
                    allCrimes={allCrimes}
                    allStopSearches={allStopSearches}
                />
            </div>

            {/* Modals */}
            <Modal isOpen={modal.modal.trend} onClose={closeModal} title="Crime Trend Summary">
                {modal.isLoading ? <div className="loading-spinner"></div> : modal.content}
            </Modal>
            <Modal isOpen={modal.modal.insights} onClose={closeModal} title="Crime Insights & Analysis">
                 {modal.isLoading ? <div className="loading-spinner"></div> : modal.content}
            </Modal>
            <Modal isOpen={modal.modal.predictive} onClose={closeModal} title="Predictive Crime Hotspots">
                 {modal.isLoading ? <div className="loading-spinner"></div> : modal.content}
            </Modal>

            {/* Crime List */}
            <CollapsibleSection title="Recent Crime Incidents">
                <table className="min-w-full divide-y divide-[#4A5D6B]">
                    <thead>
                        <tr className="bg-[#21262D]">
                            <th onClick={() => handleCrimeSort('month')} className="cursor-pointer p-2.5 text-left font-bold text-[#FFD700] border-b border-solid border-[#FFD700] shadow-[0_0_2px_rgba(255,215,0,0.5)]">Date & Time {crimeSortConfig.key === 'month' && (crimeSortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                            <th onClick={() => handleCrimeSort('category')} className="cursor-pointer p-2.5 text-left font-bold text-[#FFD700] border-b border-solid border-[#FFD700] shadow-[0_0_2px_rgba(255,215,0,0.5)]">Type {crimeSortConfig.key === 'category' && (crimeSortConfig.direction === 'asc' ? '▲' : '▼')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#4A5D6B]">
                        {sortedCrimes.map(crime => {
                            const crimeId = crime.persistent_id || String(crime.id);
                            return (
                                <tr 
                                    key={crimeId} 
                                    className={`bg-[#161B22] hover:bg-[#21262D] cursor-pointer ${(selectedCrimeId === crimeId) ? 'table-row-highlighted' : ''}`}
                                    onClick={() => handleItemSelection('crime', crime)}
                                >
                                    <td className="p-2 whitespace-nowrap">{moment(crime.month).format("MMMM YYYY")}</td>
                                    <td className="p-2 whitespace-nowrap">{crime.category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </CollapsibleSection>

            {/* Stop & Search List */}
            <CollapsibleSection title="Recent Stop & Search Incidents">
                <table className="min-w-full divide-y divide-[#4A5D6B] text-xs">
                     <thead className="bg-[#21262D]">
                        <tr>
                            {stopSearchHeaders.map(header => (
                                <th 
                                    key={header.key} 
                                    onClick={() => handleStopSearchSort(header.key)}
                                    className="cursor-pointer p-2 text-left font-bold uppercase text-[#FFD700] border-b border-solid border-[#FFD700] shadow-[0_0_2px_rgba(255,215,0,0.5)]"
                                >
                                    {header.label} {stopSearchSortConfig.key === header.key && (stopSearchSortConfig.direction === 'asc' ? '▲' : '▼')}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#4A5D6B]">
                        {sortedStopSearches.slice(0, 50).map((event, i) => (
                            <tr 
                                key={`${event.datetime}-${i}`}
                                className="bg-[#161B22] hover:bg-[#21262D] cursor-pointer" 
                                onClick={() => handleItemSelection('stopSearch', event)}
                            >
                                <td className="p-2 whitespace-nowrap">{moment(event.datetime).format('YYYY-MM-DD HH:mm')}</td>
                                <td className="p-2 whitespace-nowrap">{event.type || 'N/A'}</td>
                                <td className="p-2 whitespace-nowrap">{event.object_of_search || 'N/A'}</td>
                                <td className="p-2 whitespace-nowrap">{event.gender || 'N/A'}</td>
                                <td className="p-2 whitespace-nowrap">{event.age_range || 'N/A'}</td>
                                <td className="p-2 whitespace-nowrap">{event.self_defined_ethnicity || event.officer_defined_ethnicity || 'N/A'}</td>
                                <td className="p-2 whitespace-nowrap">{event.outcome || 'N/A'}</td>
                                <td className="p-2 whitespace-nowrap">{getNestedValue(event, 'location.street.name') || 'N/A'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </CollapsibleSection>
        </div>
    );
};

export default App;