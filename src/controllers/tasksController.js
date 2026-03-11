import * as tasksService from '../services/tasksService.js';

export async function listTasks(req, res, next) {
  try {
    const { client_id, status, due_before, due_after } = req.query;
    const data = await tasksService.listTasks(req.user.id, {
      clientId: client_id, status, dueBefore: due_before, dueAfter: due_after,
    });
    res.json(data);
  } catch (e) { next(e); }
}

export async function createTask(req, res, next) {
  try {
    const data = await tasksService.createTask(req.user.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function updateTask(req, res, next) {
  try {
    const data = await tasksService.updateTask(req.user.id, req.params.taskId, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function deleteTask(req, res, next) {
  try {
    const data = await tasksService.deleteTask(req.user.id, req.params.taskId);
    res.json(data);
  } catch (e) { next(e); }
}
