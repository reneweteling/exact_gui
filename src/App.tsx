import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { TransactionsTable } from "@/components/TransactionsTable";
import "./App.css";

// @ts-ignore - Image import
import logoRene from "@/assets/logo_rene.png";

interface Division {
  Code: number;
  CustomerName: string;
  Description: string;
}

interface Transaction {
  data: Record<string, any>;
}

interface LogEntry {
  timestamp: Date;
  message: string;
  type: "info" | "success" | "error" | "warning";
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUrl, setAuthUrl] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<number | null>(null);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportType, setExportType] = useState<"csv" | "json" | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const [currentOperation, setCurrentOperation] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const progressListenerRef = useRef<(() => void) | null>(null);
  const lastProgressMessageRef = useRef<string>("");

  useEffect(() => {
    checkAuth();
    loadAuthUrl();

    // Listen for progress updates from the backend
    const setupProgressListener = async () => {
      // Clean up existing listener if any
      if (progressListenerRef.current) {
        progressListenerRef.current();
        progressListenerRef.current = null;
      }

      const unlisten = await listen<{ current: number; total: number; message: string }>(
        "transaction-progress",
        (event) => {
          // Deduplicate: only log if message is different from last one
          if (event.payload.message !== lastProgressMessageRef.current) {
            setProgress({ current: event.payload.current, total: event.payload.total });
            addLog(event.payload.message, "info");
            lastProgressMessageRef.current = event.payload.message;
          } else {
            // Still update progress even if message is duplicate
            setProgress({ current: event.payload.current, total: event.payload.total });
          }
        }
      );
      progressListenerRef.current = unlisten;
    };

    setupProgressListener();

    return () => {
      if (progressListenerRef.current) {
        progressListenerRef.current();
        progressListenerRef.current = null;
      }
      lastProgressMessageRef.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLog = (message: string, type: LogEntry["type"] = "info") => {
    setLogs((prev: LogEntry[]) => [...prev, { timestamp: new Date(), message, type }]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const cancelOperation = async () => {
    setCancelled(true);
    setLoading(false);
    setExporting(false);
    addLog("Operation cancelled by user", "warning");
    setCurrentOperation(null);
    
    // Actually cancel the backend operation
    try {
      await invoke("cancel_operation");
    } catch (err) {
      console.error("Failed to cancel operation:", err);
    }
  };

  const checkAuth = async () => {
    try {
      const authenticated = await invoke<boolean>("is_authenticated");
      setIsAuthenticated(authenticated);
    } catch (err) {
      console.error("Auth check failed:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await invoke("logout");
      setIsAuthenticated(false);
      setDivisions([]);
      setSelectedDivision(null);
      setTransactions([]);
      setError("");
      setLogs([]);
      addLog("Logged out successfully", "info");
    } catch (err) {
      setError(`Logout failed: ${err}`);
      addLog(`Logout failed: ${err}`, "error");
    }
  };

  const loadAuthUrl = async () => {
    try {
      const url = await invoke<string>("get_auth_url");
      setAuthUrl(url);
    } catch (err) {
      console.error("Failed to get auth URL:", err);
      setError(`Failed to get auth URL: ${err}`);
    }
  };

  const handleAuthenticate = async () => {
    if (!authCode.trim()) {
      setError("Please enter the authorization code or full redirect URL");
      return;
    }

    setLoading(true);
    setError("");

    try {
      let code = authCode.trim();
      if (code.includes("?")) {
        const url = new URL(code);
        code = url.searchParams.get("code") || code;
      }

      if (!code) {
        setError("Could not extract authorization code from URL");
        setLoading(false);
        return;
      }

      await invoke("authenticate_with_code", { code });
      setIsAuthenticated(true);
      setAuthCode("");
      await loadDivisions();
    } catch (err) {
      setError(`Authentication failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const loadDivisions = async () => {
    setLoading(true);
    setError("");
    setCancelled(false);
    setCurrentOperation("Loading divisions");
    clearLogs();
    addLog("Starting to load divisions...", "info");

    try {
      addLog("Fetching divisions from Exact Online API...", "info");
      addLog("Retrieving available divisions...", "info");
      const divs = await invoke<Division[]>("get_divisions");

      if (cancelled) {
        addLog("Operation was cancelled", "warning");
        return;
      }

      addLog(`Successfully loaded ${divs.length} divisions`, "success");
      setDivisions(divs);
    } catch (err) {
      if (!cancelled) {
        addLog(`Failed to load divisions: ${err}`, "error");
        setError(`Failed to load divisions: ${err}`);
      } else {
        addLog("Operation was cancelled", "warning");
      }
    } finally {
      setLoading(false);
      setCurrentOperation(null);
    }
  };

  const handleFetchTransactions = async () => {
    if (!selectedDivision) {
      setError("Please select a division");
      return;
    }

    setLoading(true);
    setError("");
    setCancelled(false);
    setCurrentOperation("Fetching transactions");
    clearLogs();
    addLog(`Starting to fetch transactions for division ${selectedDivision}...`, "info");

    try {
      setProgress(null);
      if (filter.trim()) {
        addLog(`Applying filter: ${filter}`, "info");
      }

      addLog("Connecting to Exact Online API...", "info");

      const txs = await invoke<Transaction[]>("get_transactions", {
        division: selectedDivision,
        filter: filter.trim() || null,
      });

      setProgress(null);

      if (cancelled) {
        addLog("Operation was cancelled", "warning");
        return;
      }

      addLog(`Successfully fetched ${txs.length} transactions`, "success");
      setTransactions(txs);
    } catch (err) {
      setProgress(null);
      if (!cancelled) {
        addLog(`Failed to fetch transactions: ${err}`, "error");
        setError(`Failed to fetch transactions: ${err}`);
      } else {
        addLog("Operation was cancelled", "warning");
      }
    } finally {
      setLoading(false);
      setCurrentOperation(null);
      setProgress(null);
    }
  };

  const getFilenamePrefix = (): string => {
    if (!selectedDivision) {
      return "transactions";
    }
    return `${selectedDivision}-transactions`;
  };

  const handleExportCSV = async () => {
    if (transactions.length === 0) {
      setError("No transactions to export");
      return;
    }

    // Filter out any transactions without data
    const validTransactions = transactions.filter(
      (tx: Transaction) => tx && tx.data && typeof tx.data === "object"
    );

    if (validTransactions.length === 0) {
      setError("No valid transactions to export");
      return;
    }

    setExporting(true);
    setExportType("csv");
    setError("");

    try {
      const filenamePrefix = getFilenamePrefix();
      const filePath = await save({
        filters: [
          {
            name: "CSV",
            extensions: ["csv"],
          },
        ],
        defaultPath: `${filenamePrefix}.csv`,
      });

      if (!filePath) {
        setExporting(false);
        setExportType(null);
        return;
      }

      const headers = Object.keys(validTransactions[0].data);
      const csvRows = [
        headers.join(","),
        ...validTransactions.map((tx: Transaction) =>
          headers
            .map((header: string) => {
              const value = tx.data?.[header];
              if (value === null || value === undefined) return "";
              const str = String(value);
              if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                return `"${str.replace(/"/g, '""')}"`;
              }
              return str;
            })
            .join(",")
        ),
      ];

      const csvContent = csvRows.join("\n");
      await writeTextFile(filePath, csvContent);
      setError("");
      alert(`Exported ${validTransactions.length} transactions to ${filePath}`);
    } catch (err) {
      setError(`Export failed: ${err}`);
    } finally {
      setExporting(false);
      setExportType(null);
    }
  };

  const handleExportJSON = async () => {
    if (transactions.length === 0) {
      setError("No transactions to export");
      return;
    }

    // Filter out any transactions without data
    const validTransactions = transactions.filter(
      (tx: Transaction) => tx && tx.data && typeof tx.data === "object"
    );

    if (validTransactions.length === 0) {
      setError("No valid transactions to export");
      return;
    }

    setExporting(true);
    setExportType("json");
    setError("");

    try {
      const filenamePrefix = getFilenamePrefix();
      const filePath = await save({
        filters: [
          {
            name: "JSON",
            extensions: ["json"],
          },
        ],
        defaultPath: `${filenamePrefix}.json`,
      });

      if (!filePath) {
        setExporting(false);
        setExportType(null);
        return;
      }

      // Convert transactions to JSON array
      const jsonData = validTransactions.map((tx: Transaction) => tx.data);
      const jsonContent = JSON.stringify(jsonData, null, 2);
      await writeTextFile(filePath, jsonContent);
      setError("");
      alert(`Exported ${validTransactions.length} transactions to ${filePath}`);
    } catch (err) {
      setError(`Export failed: ${err}`);
    } finally {
      setExporting(false);
      setExportType(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                Exact Online Authentication
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Connect your Exact Online account to get started
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
              <h2 className="font-semibold text-blue-900 dark:text-blue-200 mb-4">
                Authentication Steps:
              </h2>
              <ol className="space-y-2 text-sm text-blue-800 dark:text-blue-300">
                <li className="flex items-start">
                  <span className="font-semibold mr-2">1.</span>
                  <span>Click the button below to open the authentication page</span>
                </li>
                <li className="flex items-start">
                  <span className="font-semibold mr-2">2.</span>
                  <span>Log in to your Exact Online account</span>
                </li>
                <li className="flex items-start">
                  <span className="font-semibold mr-2">3.</span>
                  <span>Copy the entire URL from the redirect page</span>
                </li>
                <li className="flex items-start">
                  <span className="font-semibold mr-2">4.</span>
                  <span>Paste the URL or authorization code below</span>
                </li>
              </ol>
            </div>

            <div className="space-y-6">
              <div>
                {authUrl ? (
                  <button
                    onClick={async () => {
                      try {
                        await openUrl(authUrl);
                      } catch (err) {
                        setError(`Failed to open browser: ${err}`);
                      }
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open Authentication Page
                  </button>
                ) : (
                  <button
                    onClick={loadAuthUrl}
                    disabled={loading}
                    className="w-full bg-slate-500 hover:bg-slate-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 shadow-md"
                  >
                    {loading ? "Loading..." : "Load Authentication URL"}
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Authorization Code or Full Redirect URL
                </label>
                <input
                  type="text"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="Paste the full redirect URL or just the code parameter"
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-all"
                />
              </div>

              <button
                onClick={handleAuthenticate}
                disabled={loading || !authCode.trim()}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Authenticating...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Authenticate
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="mt-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4 pb-20">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700 mb-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                Exact Online Transaction Exporter
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Export financial transactions from Exact Online
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 font-normal rounded-md transition-colors duration-200 flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>

          {!divisions.length && (
            <div className="mb-6 flex gap-3">
              <button
                onClick={loadDivisions}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Load Divisions
                  </>
                )}
              </button>
              {loading && (
                <button
                  onClick={cancelOperation}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Cancel
                </button>
              )}
            </div>
          )}

          {divisions.length > 0 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Select Division
                </label>
                <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between h-11 px-4 text-left font-normal text-white dark:text-white"
                    >
                      {selectedDivision !== null
                        ? (() => {
                          const selected = divisions.find((div: Division) => div.Code === selectedDivision);
                          return selected
                            ? `${selected.CustomerName} - ${selected.Description} (${selectedDivision})`
                            : "Select division...";
                        })()
                        : "Select division..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command shouldFilter={true}>
                      <CommandInput placeholder="Search divisions..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>No division found.</CommandEmpty>
                        <CommandGroup>
                          {divisions.map((div: Division) => {
                            // Use a searchable value that includes all searchable fields
                            const itemValue = `${div.CustomerName} ${div.Description} ${div.Code}`;
                            return (
                              <CommandItem
                                key={div.Code}
                                value={itemValue}
                                onSelect={(currentValue: string) => {
                                  console.log("onSelect called:", currentValue, "div.Code:", div.Code);
                                  // Find the division that matches the selected value
                                  const selectedDiv = divisions.find(
                                    (d: Division) => `${d.CustomerName} ${d.Description} ${d.Code}` === currentValue
                                  );
                                  if (selectedDiv) {
                                    setSelectedDivision(selectedDiv.Code);
                                    setComboboxOpen(false);
                                  }
                                }}
                                className="cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedDivision === div.Code ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div
                                  className="flex flex-col flex-1"
                                  onClick={() => {
                                    console.log("div onClick called:", div.Code);
                                    setSelectedDivision(div.Code);
                                    setComboboxOpen(false);
                                  }}
                                  onMouseDown={() => {
                                    console.log("div onMouseDown called:", div.Code);
                                    setSelectedDivision(div.Code);
                                    setComboboxOpen(false);
                                  }}
                                >
                                  <span className="font-medium text-white">{div.CustomerName}</span>
                                  <span className="text-xs text-slate-300 dark:text-slate-300">
                                    {div.Description} ({div.Code})
                                  </span>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {selectedDivision && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Filter (OData format, optional)
                    </label>
                    <input
                      type="text"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder='e.g., FinancialYear gt 2022'
                      className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-all"
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      <a
                        href="https://www.odata.org/documentation/odata-version-2-0/uri-conventions/#QueryStringOptions"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Learn more about OData filters
                      </a>
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleFetchTransactions}
                      disabled={loading}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          {progress
                            ? (progress.total > 0
                              ? `Fetching ${progress.current} of ${progress.total}...`
                              : `Fetching ${progress.current} transactions...`)
                            : "Loading..."}
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Fetch Transactions
                        </>
                      )}
                    </button>
                    {loading && (
                      <button
                        onClick={cancelOperation}
                        className="bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cancel
                      </button>
                    )}

                    {transactions.length > 0 && (
                      <>
                        <button
                          onClick={handleExportCSV}
                          disabled={exporting}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
                        >
                          {exporting && exportType === "csv" ? (
                            <>
                              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Exporting CSV...
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Export CSV ({transactions.length})
                            </>
                          )}
                        </button>
                        <button
                          onClick={handleExportJSON}
                          disabled={exporting}
                          className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
                        >
                          {exporting && exportType === "json" ? (
                            <>
                              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Exporting JSON...
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              Export JSON ({transactions.length})
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="mt-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}

          {(loading || logs.length > 0) && (
            <div className="mt-6 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Activity Log
                  {currentOperation && (
                    <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                      ({currentOperation})
                    </span>
                  )}
                </h3>
                {logs.length > 0 && (
                  <button
                    onClick={clearLogs}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="bg-slate-900 dark:bg-black rounded-lg p-4 font-mono text-xs max-h-64 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-slate-500 dark:text-slate-400">
                    {loading ? "Waiting for activity..." : "No activity yet"}
                  </div>
                ) : (
                  <div className="space-y-1">
                    {logs.map((log: LogEntry, idx: number) => (
                      <div
                        key={idx}
                        className={`flex items-start gap-2 ${log.type === "error"
                          ? "text-red-400"
                          : log.type === "success"
                            ? "text-green-400"
                            : log.type === "warning"
                              ? "text-yellow-400"
                              : "text-slate-300"
                          }`}
                      >
                        <span className="text-slate-500 dark:text-slate-600 flex-shrink-0">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        <span className="flex-shrink-0 w-2">
                          {log.type === "error" && "✗"}
                          {log.type === "success" && "✓"}
                          {log.type === "warning" && "⚠"}
                          {log.type === "info" && "ℹ"}
                        </span>
                        <span className="flex-1">{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {transactions.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Transactions
              </h2>
              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-medium">
                {transactions.length} total
              </span>
            </div>

            <TransactionsTable transactions={transactions} />
          </div>
        )}

      </div>

      {/* Footer - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 py-4 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm text-slate-600 dark:text-slate-400">Proudly built by</span>
            <a
              href="https://weteling.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity"
            >
              <img src={logoRene} alt="René Weteling" className="h-12 w-auto" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
