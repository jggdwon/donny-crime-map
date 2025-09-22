import React, { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import { Crime, StopSearch, CrimeCategory, Insight, PredictiveHotspot, ModalState, SortConfig } from './types';
import * as policeApi from './services/policeApi';
import * as geminiService from './services/geminiService';
import CrimeMap from './components/CrimeMap';
import Modal from './components/Modal';
import CollapsibleSection from './components/CollapsibleSection';
import MapOverlayMenu from './components/MapOverlayMenu';
import moment from 'moment';
import { stopSearchHeaders } from './constants';

const getNestedValue = (obj: any, path: string): any => {
    if (!path) return obj;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

const ActionButton: React.FC<{ onClick?: () => void; children: React.ReactNode; disabled?: boolean; className?: string }> = ({ onClick, children, disabled, className }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`rounded-md p-2 px-3 font-semibold shadow-sm transition-all duration-150 inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm text-foreground bg-primary hover:bg-primary-focus disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
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
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme) return savedTheme;
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return 'dark'; // Default to dark if window is not defined (e.g., SSR)
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
    };

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

    // Fetch static categories once on component mount
    useEffect(() => {
        const getCategories = async () => {
            const categories = await policeApi.fetchCrimeCategories();
            setCrimeCategories(categories);
        };
        getCategories();
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

        const [crimes, stopSearches] = await Promise.all([
            policeApi.fetchCrimeData(dates),
            policeApi.fetchStopAndSearchData(dates)
        ]);

        setAllCrimes(crimes);
        setAllStopSearches(stopSearches);
        setNotification(`Updated! Data from ${moment(dates[dates.length - 1]).format('MMMM YYYY')} to ${moment(dates[0]).format('MMMM YYYY')}.`);
        setIsLoading(false);
    }, []);

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

    const handleSummarizeTrends = useCallback(() => handleAIFeature(
        'trend',
        () => geminiService.summarizeCrimeTrends(filteredCrimes),
        (summary) => <div dangerouslySetInnerHTML={{ __html: summary.replace(/\n/g, '<br/>') }} />
    ), [handleAIFeature, filteredCrimes]);

    const handleGenerateInsights = useCallback(() => handleAIFeature(
        'insights',
        () => geminiService.generateCrimeInsights(filteredCrimes),
        (insightData: Insight[]) => {
            setInsights(insightData);
            setInsightsVisible(true);
            return insightData.length > 0 ?
                <ul className="list-disc pl-5">{insightData.map((item, i) => <li key={i}><strong>{item.area}:</strong> {item.insight}</li>)}</ul> :
                'No insights could be generated from the current data.';
        }
    ), [handleAIFeature, filteredCrimes]);

    const handleGeneratePredictiveHotspots = useCallback(() => handleAIFeature(
        'predictive',
        () => geminiService.generatePredictiveHotspots(allCrimes),
        (hotspotData: PredictiveHotspot[]) => {
            setPredictiveHotspots(hotspotData);
            setPredictiveHotspotsVisible(true);
            return hotspotData.length > 0 ?
                <ul className="list-disc pl-5">{hotspotData.map((item, i) => <li key={i}><strong>{item.area} ({item.predictedCrimeType}):</strong> {item.reason}</li>)}</ul> :
                'No predictive hotspots could be generated.';
        }
    ), [handleAIFeature, allCrimes]);
    
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

    return (
        <div className="container mx-auto bg-background text-foreground p-2 sm:p-4 rounded-lg shadow-2xl max-w-7xl">
            {/* Header */}
            <header className="flex flex-col sm:flex-row justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <svg className="w-10 h-10 sm:w-12 sm:h-12 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <h1 className="text-2xl sm:text-4xl font-bold text-foreground">Doncaster Crime Activity</h1>
                </div>
            </header>

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
                    onCrimeSelect={handleItemSelection}
                    selectedCrimeId={selectedCrimeId}
                    selectedStopSearch={selectedStopSearch}
                    allCrimes={allCrimes}
                    allStopSearches={allStopSearches}
                    closeModal={closeModal}
                />
            </div>

            {/* Map Overlay Menu */}
            <MapOverlayMenu
                notification={notification}
                isLoading={isLoading}
                fetchData={fetchData}
                selectedCategory={selectedCategory}
                setSelectedCategory={setSelectedCategory}
                crimeCategories={crimeCategories}
                handleSummarizeTrends={handleSummarizeTrends}
                isDensityHeatmapVisible={isDensityHeatmapVisible}
                setDensityHeatmapVisible={setDensityHeatmapVisible}
                isRecencyHeatmapVisible={isRecencyHeatmapVisible}
                setRecencyHeatmapVisible={setRecencyHeatmapVisible}
                isInsightsVisible={isInsightsVisible}
                setInsightsVisible={setInsightsVisible}
                handleGenerateInsights={handleGenerateInsights}
                predictiveHotspots={predictiveHotspots}
                isPredictiveHotspotsVisible={isPredictiveHotspotsVisible}
                setPredictiveHotspotsVisible={setPredictiveHotspotsVisible}
                handleGeneratePredictiveHotspots={handleGeneratePredictiveHotspots}
                modal={modal}
                sortedCrimes={sortedCrimes}
                crimeSortConfig={crimeSortConfig}
                handleCrimeSort={handleCrimeSort}
                handleItemSelection={handleItemSelection}
                selectedCrimeId={selectedCrimeId}
                sortedStopSearches={sortedStopSearches}
                stopSearchSortConfig={stopSearchSortConfig}
                handleStopSearchSort={handleStopSearchSort}
                selectedStopSearch={selectedStopSearch}
            />

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
        </div>
    );
};

export default App;