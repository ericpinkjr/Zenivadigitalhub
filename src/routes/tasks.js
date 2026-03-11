import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { listTasks, createTask, updateTask, deleteTask } from '../controllers/tasksController.js';

const router = Router();

router.get('/', auth, listTasks);
router.post('/', auth, createTask);
router.patch('/:taskId', auth, updateTask);
router.delete('/:taskId', auth, deleteTask);

export default router;
