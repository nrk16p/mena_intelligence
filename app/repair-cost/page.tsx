import { FileUploadForm } from "@/components/file-upload-form"

export default function RepairCostPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">
        Calculate Repair Cost Allocation
      </h1>

      <FileUploadForm />
    </div>
  )
}