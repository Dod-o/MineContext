// Copyright (c) 2025 Beijing Volcano Engine Technology Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import {
  Button,
  Card,
  Input,
  Message,
  Modal,
  Popconfirm,
  Checkbox,
  Radio,
  Select,
  Space,
  Typography,
  Tree,
  Form,
  Tooltip
} from '@arco-design/web-react'
import { IconCheck, IconClose, IconDelete, IconSelectAll } from '@arco-design/web-react/icon'
import { Task, useHomeInfo } from '@renderer/hooks/use-home-info'
import { FC, useEffect, useMemo, useRef, useState } from 'react'
import taskEmpty from '@renderer/assets/images/task-empty.svg'
import addIcon from '@renderer/assets/icons/add.svg'
import copyIcon from '@renderer/assets/images/copy.svg'
import { useInitPrepareData } from '@renderer/hooks/use-init-prepare-data'
import { TaskStatus, TaskUrgency, TODO_LIST_STATUS } from '@renderer/constant/feed'
import { useMemoizedFn } from 'ahooks'
import highPriorityIcon from '@renderer/assets/icons/high-priority.svg'
import mediumPriorityIcon from '@renderer/assets/icons/medium-priority.svg'
import lowPriorityIcon from '@renderer/assets/icons/low-priority.svg'
import doneIcon from '@renderer/assets/icons/done.svg'
import dayjs from 'dayjs'

const { Text } = Typography
const TextArea = Input.TextArea
const TreeNode = Tree.Node

function getTodoIcon(urgency: TaskUrgency) {
  switch (urgency) {
    case TaskUrgency.High:
      return highPriorityIcon
    case TaskUrgency.Medium:
      return mediumPriorityIcon
    case TaskUrgency.Low:
      return lowPriorityIcon
    case TaskUrgency.Done:
      return doneIcon
    default:
      return lowPriorityIcon
  }
}

function genTodoTitle(urgency: TaskUrgency) {
  switch (urgency) {
    case TaskUrgency.High:
      return 'Urgent'
    case TaskUrgency.Medium:
      return 'Medium Priority'
    case TaskUrgency.Low:
      return 'Low Priority'
    case TaskUrgency.Done:
      return 'Done'
    default:
      return 'Unknown Priority'
  }
}
export interface ToDoCardProps {
  selectedDays: string | null
}
const ToDoCard: FC<ToDoCardProps> = (props) => {
  const { selectedDays } = props
  const { tasks, toggleTaskStatus, updateTask, deleteTask, addTask, fetchTasks } = useHomeInfo()
  const [isTaskHover, setIsTaskHover] = useState<number | null>(null) // Edit task status
  const [isDeleting, setIsDeleting] = useState(false)
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [isBatchDeleting, setIsBatchDeleting] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([])
  const [copiedTaskId, setCopiedTaskId] = useState<number | null>(null) // Copied tooltip state
  const { deleteTodoList, data: todoListInitData } = useInitPrepareData()
  const [form] = Form.useForm()
  const reviewTasks = useMemo(() => tasks.filter((task) => task.status === TaskStatus.Review), [tasks])
  const filterDoneTasks = useMemo(
    () =>
      tasks.filter((task) => task.status !== TaskStatus.Review).map((task) => {
        // Set urgency to done when task is done
        if (task.status === TaskStatus.Completed) {
          return {
            ...task,
            urgency: TaskUrgency.Done
          }
        }
        return task
      }),
    [tasks]
  )
  const visibleTasks = useMemo(
    () => [...(todoListInitData as unknown as Task[]), ...filterDoneTasks],
    [filterDoneTasks, todoListInitData]
  )
  const visibleTaskIds = useMemo(() => visibleTasks.map((task) => task.id), [visibleTasks])
  const selectedVisibleTaskIds = useMemo(
    () => selectedTaskIds.filter((id) => visibleTaskIds.includes(id)),
    [selectedTaskIds, visibleTaskIds]
  )
  const initialTodoIds = useMemo(() => new Set(todoListInitData.map((task) => task.id)), [todoListInitData])
  const hasVisibleTasks = useMemo(() => visibleTasks.length > 0, [visibleTasks])
  const hasTasks = useMemo(() => hasVisibleTasks || reviewTasks.length > 0, [hasVisibleTasks, reviewTasks.length])
  const isAllTasksSelected = hasVisibleTasks && selectedVisibleTaskIds.length === visibleTaskIds.length
  const isSomeTasksSelected = selectedVisibleTaskIds.length > 0 && !isAllTasksSelected

  // Handle deleting a task
  const handleDeleteTask = useMemoizedFn(async (taskId: number) => {
    try {
      if (initialTodoIds.has(taskId)) {
        await deleteTodoList(taskId)
      } else {
        await deleteTask(taskId)
      }
      Message.success('task delete success')
    } catch (error) {
      Message.error('task delete failed')
    } finally {
      setIsDeleting(false)
      setIsTaskHover(null)
    }
  })

  const handleCopyContent = useMemoizedFn(async (content: string, taskId: number) => {
    try {
      await navigator.clipboard.writeText(content)

      // Show tooltip
      setCopiedTaskId(taskId)

      // Hide tooltip after 2 seconds
      setTimeout(() => {
        setCopiedTaskId(null)
      }, 2000)
    } catch (error) {
      Message.error('Failed to copy content')
    }
  })

  const handleToggleBatchMode = useMemoizedFn(() => {
    if (isBatchMode) {
      setSelectedTaskIds([])
    }
    setIsTaskHover(null)
    setIsBatchMode(!isBatchMode)
  })

  const handleSelectTask = useMemoizedFn((taskId: number, checked: boolean) => {
    setSelectedTaskIds((ids) => {
      if (checked) {
        return ids.includes(taskId) ? ids : [...ids, taskId]
      }
      return ids.filter((id) => id !== taskId)
    })
  })

  const handleSelectAllTasks = useMemoizedFn((checked: boolean) => {
    setSelectedTaskIds(checked ? visibleTaskIds : [])
  })

  const handleDeleteSelectedTasks = useMemoizedFn(async () => {
    const taskIds = selectedVisibleTaskIds.filter((id) => !initialTodoIds.has(id))
    const initialIds = selectedVisibleTaskIds.filter((id) => initialTodoIds.has(id))

    if (selectedVisibleTaskIds.length === 0) {
      return
    }

    try {
      setIsBatchDeleting(true)
      if (initialIds.length > 0) {
        await deleteTodoList(initialIds)
      }
      for (const taskId of taskIds) {
        await deleteTask(taskId)
      }
      setSelectedTaskIds([])
      setIsBatchMode(false)
      Message.success('tasks delete success')
    } catch (error) {
      Message.error('tasks delete failed')
    } finally {
      setIsBatchDeleting(false)
      setIsTaskHover(null)
    }
  })

  const handleConfirmGeneratedTask = useMemoizedFn(async (taskId: number) => {
    try {
      await updateTask(taskId, { status: TaskStatus.Pending })
      Message.success('task confirmed')
    } catch (error) {
      Message.error('task confirm failed')
    }
  })

  const handleConfirmAllGeneratedTasks = useMemoizedFn(async () => {
    try {
      for (const task of reviewTasks) {
        await updateTask(task.id, { status: TaskStatus.Pending })
      }
      Message.success('tasks confirmed')
    } catch (error) {
      Message.error('tasks confirm failed')
    }
  })

  const handleDeleteGeneratedTask = useMemoizedFn(async (taskId: number) => {
    try {
      await deleteTask(taskId)
      Message.success('task delete success')
    } catch (error) {
      Message.error('task delete failed')
    }
  })

  const handleDeleteAllGeneratedTasks = useMemoizedFn(async () => {
    try {
      for (const task of reviewTasks) {
        await deleteTask(task.id)
      }
      Message.success('tasks delete success')
    } catch (error) {
      Message.error('tasks delete failed')
    }
  })

  const renderTask = (task) => {
    const isSelected = selectedTaskIds.includes(task.id)

    return (
      <div
        key={task.id}
        className={`flex w-full px-6 max-w-[1000px] items-center justify-between rounded-[4px] ${isBatchMode ? 'cursor-pointer' : ''}`}
        onClick={() => {
          if (isBatchMode) {
            handleSelectTask(task.id, !isSelected)
          }
        }}
        onMouseEnter={() => {
          setIsTaskHover(task.id)
        }}
        onMouseLeave={() => {
          if (!isDeleting) {
            setIsTaskHover(null)
          }
        }}>
        <div className="gap-2 flex-1 flex items-center">
          {isBatchMode ? (
            <Checkbox
              className="self-start mt-0.5"
              checked={isSelected}
              onClick={(event) => event.stopPropagation()}
              onChange={(checked) => handleSelectTask(task.id, checked)}
            />
          ) : (
            <Radio className="self-start mt-0.5" checked={!!task.status} onClick={() => handleToggleTaskStatus(task)} />
          )}
          <div
            className={`font-roboto text-sm font-normal text-[#3F3F51] leading-[22px] max-w-[800px] tracking-[0.042px] whitespace-normal break-words ${task.status === TaskStatus.Completed ? 'line-through' : ''}`}
            onClick={() => {
              if (!isBatchMode) {
                handleEditToDoList(task)
              }
            }}>
            {task.content}
          </div>
        </div>
        {!isBatchMode && (
          <div className={`flex items-center ml-2 gap-3 ${isTaskHover === task.id ? 'opacity-100' : 'opacity-0'}`}>
            <Tooltip content="Copied!" position="top" popupVisible={copiedTaskId === task.id}>
              <Button
                type="text"
                size="small"
                className="[&_.arco-btn-size-small]: !w-[14px] !h-[14px]"
                icon={<img src={copyIcon} alt="copyIcon" className="w-[14px] h-[14px]" />}
                onClick={() => handleCopyContent(task.content, task.id)}
                disabled={task.status === TaskStatus.Completed}
              />
            </Tooltip>
            <Popconfirm
              title="Confirm delete"
              content="Confirm to delete this todo?"
              onOk={() => handleDeleteTask(task.id)}
              onCancel={() => {
                setIsDeleting(false)
                setIsTaskHover(null)
              }}
              onVisibleChange={(visible) => {
                if (!visible) {
                  setIsDeleting(false)
                  setIsTaskHover(null)
                }
              }}
              okText="Confirm"
              cancelText="Cancel">
              <Button
                type="text"
                size="small"
                icon={<IconDelete />}
                className="[&_.arco-btn-size-small]: !w-[13px] !h-[13px]"
                style={{ color: '#f53f3f' }}
                onClick={() => {
                  setIsDeleting(true)
                }}
              />
            </Popconfirm>
          </div>
        )}
      </div>
    )
  }

  const renderReviewTask = (task: Task) => (
    <div key={task.id} className="flex w-full items-start justify-between gap-3 px-6 py-1">
      <div className="min-w-0 flex-1 font-roboto text-sm font-normal text-[#3F3F51] leading-[22px] tracking-[0.042px] whitespace-normal break-words">
        {task.content}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button type="text" size="mini" icon={<IconCheck />} onClick={() => handleConfirmGeneratedTask(task.id)}>
          Add
        </Button>
        <Popconfirm
          title="Confirm delete"
          content="Confirm to delete this todo?"
          onOk={() => handleDeleteGeneratedTask(task.id)}
          okText="Confirm"
          cancelText="Cancel">
          <Button type="text" size="mini" status="danger" icon={<IconDelete />}>
            Delete
          </Button>
        </Popconfirm>
      </div>
    </div>
  )

  function buildTodoTree(tasks: Task[]) {
    const rootTitle = (urgency: TaskUrgency) => (
      <div className="flex items-center gap-2">
        <img src={getTodoIcon(urgency)} alt="todoIcon" />
        <div
          className="font-roboto text-sm text-[#0B0B0F] leading-[22px] tracking-[0.042px]"
          style={{
            fontWeight: 500
          }}>
          {genTodoTitle(urgency)}
        </div>
      </div>
    )

    const baseTree: { title: React.ReactNode; key: string; children: { title: React.ReactNode; key: string }[] }[] = [
      {
        title: rootTitle(TaskUrgency.High),
        key: genTodoTitle(TaskUrgency.High),
        children: []
      },
      {
        title: rootTitle(TaskUrgency.Medium),
        key: genTodoTitle(TaskUrgency.Medium),
        children: []
      },
      {
        title: rootTitle(TaskUrgency.Low),
        key: genTodoTitle(TaskUrgency.Low),
        children: []
      },
      {
        title: rootTitle(TaskUrgency.Done),
        key: genTodoTitle(TaskUrgency.Done),
        children: []
      }
    ]
    tasks.forEach((task) => {
      const taskTitle = renderTask(task)
      const nodeParam = {
        title: taskTitle,
        key: String(task.id)
      }
      switch (task.urgency) {
        case TaskUrgency.High:
          baseTree[0].children.push(nodeParam)
          break
        case TaskUrgency.Medium:
          baseTree[1].children.push(nodeParam)
          break
        case TaskUrgency.Low:
          baseTree[2].children.push(nodeParam)
          break
        case TaskUrgency.Done:
          baseTree[3].children.push(nodeParam)
          break
      }
    })
    const retTree = baseTree.filter((node) => node.children.length > 0)
    return (
      <Tree autoExpandParent blockNode actionOnClick="expand">
        {retTree.map((node) => (
          <TreeNode key={node.key} title={node.title}>
            {node.children.map((child) => (
              <TreeNode
                key={child.key}
                title={child.title}
                className="[&_.arco-tree-node-indent]:hidden [&_.arco-tree-node-switcher]:hidden"
              />
            ))}
          </TreeNode>
        ))}
      </Tree>
    )
  }

  const [status, setStatus] = useState(TODO_LIST_STATUS.Create)
  const [visible, setVisible] = useState(false)
  const timer = useRef<NodeJS.Timeout>(null)
  const handleCreateToDoList = useMemoizedFn(() => {
    clearTimeout(timer.current!)
    form.resetFields()
    form.setFieldsValue({
      id: undefined,
      content: '',
      urgency: TaskUrgency.Low
    })
    setStatus(TODO_LIST_STATUS.Create)
    setVisible(true)
  })
  const handleToggleTaskStatus = useMemoizedFn(async (task) => {
    let id = task.id

    if (todoListInitData.some((v) => v.id === task.id)) {
      await deleteTodoList(task.id)
      id = await addTask({
        content: task.content,
        urgency: task.urgency,
        status: TaskStatus.Pending
      })
    }
    timer.current = setTimeout(() => {
      toggleTaskStatus(id)
    }, 300)
  })
  const handleEditToDoList = useMemoizedFn((task) => {
    setStatus(TODO_LIST_STATUS.Edit)
    setVisible(true)
    timer.current = setTimeout(() => {
      form.setFieldsValue(task)
    }, 100)
  })
  const createTodoList = useMemoizedFn(async () => {
    try {
      await form.validate()
      const values = form.getFieldsValue()
      await addTask({
        content: values.content,
        urgency: values.urgency
      })
      Message.success('Task add success')
    } catch (error: any) {
      Message.error(error.message || '')
    }
  })

  const editTodoList = useMemoizedFn(async () => {
    try {
      await form.validate()
      const values = form.getFieldsValue()
      if (todoListInitData.some((v) => v.id === values.id)) {
        await deleteTodoList(values.id)
        await addTask({
          content: values.content,
          urgency: values.urgency
        })
      } else {
        await updateTask(values.id, {
          content: values.content,
          urgency: values.urgency
        })
      }
      Message.success('task update success')
    } catch (error: any) {
      Message.error(error.message || '')
    }
  })

  const handleSave = useMemoizedFn(async () => {
    try {
      if (status === TODO_LIST_STATUS.Create) {
        await createTodoList()
      } else {
        await editTodoList()
      }
      setVisible(false)
    } catch (e: any) {
      Message.error(e.message || '')
    } finally {
      clearTimeout(timer.current!)
    }
  })

  useEffect(() => {
    // Need to refresh the task list after clicking a date on the heatmap
    if (selectedDays) {
      fetchTasks(dayjs(selectedDays))
    }
  }, [selectedDays])

  useEffect(() => {
    setSelectedTaskIds((ids) => {
      const nextIds = ids.filter((id) => visibleTaskIds.includes(id))
      return nextIds.length === ids.length ? ids : nextIds
    })
    if (visibleTaskIds.length === 0) {
      setIsBatchMode(false)
    }
  }, [visibleTaskIds])

  return (
    <>
      <Card
        className="flex max-h-[460px] p-3 flex-col items-start gap-4 self-stretch rounded-[10px] border border-[var(--line-color-border-3,#E1E3EF)] bg-white w-full"
        headerStyle={{
          width: '100%'
        }}
        title={
          <div className="flex flex-1 justify-between items-center w-full">
            <Space style={{ marginTop: 5 }}>
              <div className="flex px-[2px] justify-center items-center gap-[4px] rounded-[2px] bg-gradient-to-l from-[rgba(239,251,248,0.5)] to-[#F5FBEF]">
                <div className="mr-[0.3em] font-['Roboto'] text-[15px] font-extralight leading-[22px] tracking-[0.045px] bg-gradient-to-l from-[#007740] to-[#D0B400] bg-clip-text text-transparent">
                  Todo
                </div>
              </div>
              <div className="text-black font-['Roboto'] text-sm font-medium leading-[22px] tracking-[0.042px]">
                today
              </div>
            </Space>
            <div className="flex items-center gap-2">
              {hasVisibleTasks && (
                <Button
                  type={isBatchMode ? 'secondary' : 'text'}
                  size="mini"
                  icon={isBatchMode ? <IconClose /> : <IconSelectAll />}
                  onClick={handleToggleBatchMode}>
                  {isBatchMode ? 'Cancel' : 'Batch'}
                </Button>
              )}
              <img src={addIcon} alt="" onClick={handleCreateToDoList} className="cursor-pointer" />
            </div>
          </div>
        }
        bodyStyle={{
          alignItems: hasTasks ? 'flex-start' : 'center',
          justifyContent: hasTasks ? 'flex-start' : 'center',
          width: '100%',
          overflow: 'auto',
          scrollbarWidth: 'none',
          marginTop: '-10px'
        }}>
        <div className={`flex h-[340px] max-h-[340px] flex-col gap-4 self-stretch`}>
          {hasTasks ? (
            <>
              {reviewTasks.length > 0 && (
                <div className="flex flex-col gap-2 self-stretch border-b border-[#E1E3EF] pb-3">
                  <div className="flex items-center justify-between gap-3 px-6">
                    <Text className="font-roboto text-sm font-medium text-[#0B0B0F]">Suggested</Text>
                    <div className="flex items-center gap-2">
                      <Button
                        type="text"
                        size="mini"
                        icon={<IconCheck />}
                        onClick={handleConfirmAllGeneratedTasks}>
                        Add all
                      </Button>
                      <Popconfirm
                        title="Confirm delete"
                        content="Confirm to delete suggested todos?"
                        onOk={handleDeleteAllGeneratedTasks}
                        okText="Confirm"
                        cancelText="Cancel">
                        <Button type="text" size="mini" status="danger" icon={<IconDelete />}>
                          Delete all
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">{reviewTasks.map(renderReviewTask)}</div>
                </div>
              )}
              {isBatchMode && hasVisibleTasks && (
                <div className="flex items-center justify-between gap-3 px-6 py-1 border-b border-[#E1E3EF]">
                  <Checkbox
                    checked={isAllTasksSelected}
                    indeterminate={isSomeTasksSelected}
                    onChange={handleSelectAllTasks}>
                    {selectedVisibleTaskIds.length}/{visibleTaskIds.length}
                  </Checkbox>
                  <Popconfirm
                    title="Confirm delete"
                    content="Confirm to delete selected todos?"
                    onOk={handleDeleteSelectedTasks}
                    okText="Confirm"
                    cancelText="Cancel">
                    <Button
                      type="text"
                      size="mini"
                      status="danger"
                      icon={<IconDelete />}
                      disabled={selectedVisibleTaskIds.length === 0}
                      loading={isBatchDeleting}>
                      Delete
                    </Button>
                  </Popconfirm>
                </div>
              )}
              {hasVisibleTasks && <div>{buildTodoTree(visibleTasks)}</div>}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center pt-[60px] pb-[60px] text-center">
              <img src={taskEmpty} alt="empty" className="w-20 h-20 mb-4" />
              <Text type="secondary">Update at 8 am everyday</Text>
            </div>
          )}
        </div>
      </Card>
      {/* Edit task modal */}
      <Modal
        title={status === TODO_LIST_STATUS.Create ? 'Add todo' : 'Edit todo'}
        visible={visible}
        onOk={handleSave}
        onCancel={() => setVisible(false)}
        okText={status === TODO_LIST_STATUS.Create ? 'Add' : 'Update'}
        cancelText="Cancel"
        unmountOnExit>
        <Form
          layout="vertical"
          form={form}
          initialValues={{ urgency: TaskUrgency.Low }}
          className="[&_.arco-form-label-item>label]:!flex">
          <Form.Item field="id" noStyle>
            <Input className="hidden" />
          </Form.Item>
          <Form.Item
            label="Todo content"
            field="content"
            rules={[{ required: true, message: 'Please input task content' }]}>
            <TextArea autoSize placeholder="Input todo content" />
          </Form.Item>
          <Form.Item label="Priority" field="urgency">
            <Select>
              <Select.Option value={TaskUrgency.High}>Urgent</Select.Option>
              <Select.Option value={TaskUrgency.Medium}>Medium Priority</Select.Option>
              <Select.Option value={TaskUrgency.Low}>Low Priority</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
export { ToDoCard }
