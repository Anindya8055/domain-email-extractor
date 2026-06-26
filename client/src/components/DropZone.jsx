import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileSpreadsheet, Sparkles, AlertTriangle } from 'lucide-react';

export default function DropZone({ onFile, uploading, uploadProgress, error }) {
  const onDrop = useCallback(
    (acceptedFiles) => {
      if (acceptedFiles?.[0]) onFile(acceptedFiles[0]);
    },
    [onFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    disabled: uploading,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`group relative overflow-hidden rounded-[28px] border p-8 transition duration-300 md:p-10 ${
          isDragActive
            ? 'border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.18),0_20px_60px_rgba(8,145,178,0.18)]'
            : 'border-white/10 bg-[#0b1728]/80 hover:border-cyan-400/20 hover:bg-[#0d1b2f]'
        } ${uploading ? 'pointer-events-none opacity-75' : ''}`}
      >
        <input {...getInputProps()} />

        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="mb-5 grid h-20 w-20 place-items-center rounded-[24px] border border-white/10 bg-white/5 shadow-inner shadow-white/5">
            {isDragActive ? (
              <UploadCloud size={34} className="text-cyan-300" />
            ) : (
              <FileSpreadsheet size={34} className="text-cyan-300" />
            )}
          </div>

          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-200">
            <Sparkles size={13} />
            Drag files directly into the drop zone
          </div>

          <h3 className="text-xl font-semibold text-white">
            {isDragActive ? 'Drop your file to start extraction' : 'Upload a domain workbook'}
          </h3>

          <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
            Supports Excel and CSV files. The crawler will process domains, inspect relevant pages,
            and return any publicly visible email addresses it finds.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">.xlsx</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">.xls</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">.csv</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Max 10MB</span>
          </div>
        </div>

        {uploading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#07111f]/85 backdrop-blur-md">
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-slate-300">Uploading file...</span>
                <span className="font-semibold text-cyan-300">{uploadProgress}%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}