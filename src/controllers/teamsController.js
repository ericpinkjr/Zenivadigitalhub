import * as teamsService from '../services/teamsService.js';

export async function list(req, res, next) {
  try {
    const data = await teamsService.listTeams(req.org.id);
    res.json(data);
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const data = await teamsService.createTeam(req.org.id, req.body);
    res.status(201).json(data);
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const data = await teamsService.updateTeam(req.org.id, req.params.teamId, req.body);
    res.json(data);
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    const data = await teamsService.deleteTeam(req.org.id, req.params.teamId);
    res.json(data);
  } catch (err) { next(err); }
}

export async function addMember(req, res, next) {
  try {
    const data = await teamsService.addTeamMember(req.org.id, req.params.teamId, req.body);
    res.status(201).json(data);
  } catch (err) { next(err); }
}

export async function removeMember(req, res, next) {
  try {
    const data = await teamsService.removeTeamMember(req.org.id, req.params.teamId, req.params.userId);
    res.json(data);
  } catch (err) { next(err); }
}
