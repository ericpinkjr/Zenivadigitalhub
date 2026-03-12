import * as tasksService from '../services/tasksService.js';
import * as teamsService from '../services/teamsService.js';

export async function listTasks(req, res, next) {
  try {
    const { client_id, status, due_before, due_after, assigned_to_user_id, team_id } = req.query;

    let assignedToUserIds = null;
    if (team_id) {
      const teams = await teamsService.listTeams(req.org.id);
      const team = teams.find(t => t.id === team_id);
      if (team) assignedToUserIds = team.team_members.map(m => m.user_id);
    }

    const data = await tasksService.listTasks(req.org.id, {
      clientId: client_id, status, dueBefore: due_before, dueAfter: due_after,
      assignedToUserId: assigned_to_user_id,
      assignedToUserIds,
    });
    res.json(data);
  } catch (e) { next(e); }
}

export async function createTask(req, res, next) {
  try {
    const data = await tasksService.createTask(req.org.id, req.body);
    res.status(201).json(data);
  } catch (e) { next(e); }
}

export async function updateTask(req, res, next) {
  try {
    const data = await tasksService.updateTask(req.org.id, req.params.taskId, req.body);
    res.json(data);
  } catch (e) { next(e); }
}

export async function deleteTask(req, res, next) {
  try {
    const data = await tasksService.deleteTask(req.org.id, req.params.taskId);
    res.json(data);
  } catch (e) { next(e); }
}
