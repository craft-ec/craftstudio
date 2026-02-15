import { Database } from "lucide-react";

export default function DataDashboard() {
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Database className="text-craftec-500" /> DataCraft
      </h1>
      <div className="bg-gray-900 rounded-xl p-8 text-center text-gray-400">
        <p className="text-lg mb-2">No content published yet</p>
        <p className="text-sm">Drag and drop files here or click to publish</p>
        <button className="mt-4 px-6 py-2 bg-craftec-600 hover:bg-craftec-700 text-white rounded-lg transition-colors">
          Publish Content
        </button>
      </div>
    </div>
  );
}
