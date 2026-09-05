"use client"

import { useRouter } from "next/navigation"
import { TaskResponse } from "@/lib/api/types"
import { TaskHierarchyTable } from "./TaskHierarchyTable"
import { tasksApi } from "@/lib/api/tasks"
import { useI18n } from "@/lib/i18n"
import { toast } from "sonner"

interface TaskExecutionHubProps {
  tasks: TaskResponse[]
  onUpdate: () => void
}

export function TaskExecutionHub({ tasks, onUpdate }: TaskExecutionHubProps) {
  const router = useRouter()
  const { t } = useI18n()

  const handleSelectTask = (task: TaskResponse) => {
    router.push(`/tasks/${task.taskId}`)
  }

  const handleUpdateStatus = async (taskId: number, status: string) => {
    try {
      await tasksApi.updateStatus(taskId, status)
      toast.success(t('taskUpdatedSuccessfully'))
      onUpdate()
    } catch (error) {
      console.error("Failed to update status", error)
      toast.error(t('failedToUpdateTask'))
    }
  }

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm(t('areYouSureDeleteTask'))) return
    try {
      await tasksApi.delete(taskId)
      toast.success(t('taskDeletedSuccessfully'))
      onUpdate()
    } catch (error) {
      console.error("Failed to delete task", error)
      toast.error(t('failedToDeleteTask'))
    }
  }

  return (
    <TaskHierarchyTable 
      tasks={tasks}
      onSelectTask={handleSelectTask}
      onUpdateStatus={handleUpdateStatus}
      onDeleteTask={handleDeleteTask}
    />
  )
}
