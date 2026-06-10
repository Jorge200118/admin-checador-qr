-- Fase 1-A (spec 2026-06-09): el bloqueo de entrada usa
-- hora_entrada + tolerancia_entrada_min como tope. Valor inicial acordado: 20 min
-- (tope 8:20 bloque mañana, 14:50 bloque tarde). Ajustable sin tocar código.
-- Solo el Horario Partido Oficina; PRACTICANTES (1016) se queda en 360 a propósito.
UPDATE bloques_horario SET tolerancia_entrada_min = 20 WHERE horario_id = 2;
