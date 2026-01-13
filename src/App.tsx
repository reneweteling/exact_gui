import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./App.css";

interface Division {
  Code: number;
  CustomerName: string;
  Description: string;
}

interface Transaction {
  data: Record<string, any>;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authUrl, setAuthUrl] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    checkAuth();
    loadAuthUrl();
  }, []);

  const checkAuth = async () => {
    try {
      const authenticated = await invoke<boolean>("is_authenticated");
      setIsAuthenticated(authenticated);
    } catch (err) {
      console.error("Auth check failed:", err);
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

    try {
      const divs = await invoke<Division[]>("get_divisions");
      setDivisions(divs);
    } catch (err) {
      setError(`Failed to load divisions: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchTransactions = async () => {
    if (!selectedDivision) {
      setError("Please select a division");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const txs = await invoke<Transaction[]>("get_transactions", {
        division: selectedDivision,
        filter: filter.trim() || null,
      });
      setTransactions(txs);
    } catch (err) {
      setError(`Failed to fetch transactions: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    if (transactions.length === 0) {
      setError("No transactions to export");
      return;
    }

    setExporting(true);
    setError("");

    try {
      const filePath = await save({
        filters: [
          {
            name: "CSV",
            extensions: ["csv"],
          },
        ],
        defaultPath: `transactions-${selectedDivision}-${Date.now()}.csv`,
      });

      if (!filePath) {
        setExporting(false);
        return;
      }

      const headers = Object.keys(transactions[0].data);
      const csvRows = [
        headers.join(","),
        ...transactions.map((tx: Transaction) =>
          headers
            .map((header: string) => {
              const value = tx.data[header];
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
      alert(`Exported ${transactions.length} transactions to ${filePath}`);
    } catch (err) {
      setError(`Export failed: ${err}`);
    } finally {
      setExporting(false);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4">
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
          </div>

          {!divisions.length && (
            <div className="mb-6">
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
            </div>
          )}

          {divisions.length > 0 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Select Division
                </label>
                <select
                  value={selectedDivision || ""}
                  onChange={(e) => setSelectedDivision(Number(e.target.value))}
                  className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-slate-900 dark:text-white transition-all"
                >
                  <option value="">-- Select a division --</option>
                  {divisions.map((div: Division) => (
                    <option key={div.Code} value={div.Code}>
                      {div.CustomerName} - {div.Description} ({div.Code})
                    </option>
                  ))}
                </select>
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
                          Loading...
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

                    {transactions.length > 0 && (
                      <button
                        onClick={handleExportCSV}
                        disabled={exporting}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium py-2.5 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
                      >
                        {exporting ? (
                          <>
                            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Exporting...
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

            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 sticky top-0">
                    <tr>
                      {Object.keys(transactions[0].data).slice(0, 10).map((key) => (
                        <th
                          key={key}
                          className="px-4 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700"
                        >
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                    {transactions.slice(0, 50).map((tx: Transaction, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        {Object.keys(transactions[0].data).slice(0, 10).map((key: string) => (
                          <td key={key} className="px-4 py-3 text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {String(tx.data[key] || "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {transactions.length > 50 && (
              <div className="mt-4 text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Showing first 50 of {transactions.length} transactions. Export to CSV to see all.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
