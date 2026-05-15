import WorkOrdersBacklog from '@/components/WorkOrdersBacklog'

export default function WorkOrdersPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Órdenes de trabajo</h1>
        <p className="text-sm text-gray-500 mt-0.5">Backlog de mantenimiento: programación, aprobación e historial.</p>
      </div>
      <WorkOrdersBacklog />
    </div>
  )
}
