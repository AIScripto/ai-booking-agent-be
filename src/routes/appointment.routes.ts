import { Router } from 'express';
import { AppointmentController } from '../controllers/appointment.controller';
import { requireAuth, requireRole, STAFF_ROLES } from '../middlewares/auth.middleware';

const router = Router();

// Every appointment and call-log route needs a signed-in staff member.
// The tenant comes from the verified token, never from a header or query.
router.use(requireAuth, requireRole(...STAFF_ROLES));

// Retrieve appointments
router.get('/', AppointmentController.listAppointments);

// Create a new appointment
router.post('/', AppointmentController.createAppointment);

// Cancel an existing appointment
router.delete('/:id', AppointmentController.cancelAppointment);

// Retrieve recent call logs
router.get('/logs', AppointmentController.listCallLogs);

// Retrieve one call log with transcript and payload
router.get('/logs/:id', AppointmentController.getCallLog);

// Generate video call link for an appointment
router.post('/:id/telehealth', AppointmentController.generateTelehealthLink);

export const appointmentRouter = router;

