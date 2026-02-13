<?php
header('Content-Type: application/json');
require_once 'db.php';
$config = require_once 'config.php';

$db = new CSVDatabase($config);

$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? $_GET['action'] : '';

try {
    if ($method === 'GET') {
        if ($action === 'stats') {
            $tickets = $db->getAll();
            $stats = [
                'total' => count($tickets),
                'rescheduled' => 0,
                'on_hold' => 0,
                'pull_out' => 0,
                'done_repair' => 0,
                'done_submitted' => 0,
                'submitted' => 0, // Assuming "Repair Submitted" is a distinct status or combined? Using prompts categories.
                'risk_high' => 0,
                'risk_medium' => 0,
                'risk_low' => 0,
                'team_performance' => []
            ];

            foreach ($tickets as $t) {
                $status = trim($t['status']);
                $risk = trim($t['risk_level']);
                $team = trim($t['team']);

                if ($status == 'Reschedule') $stats['rescheduled']++;
                if ($status == 'On Hold') $stats['on_hold']++;
                if ($status == 'For Pull Out') $stats['pull_out']++;
                if ($status == 'Done Repair') $stats['done_repair']++;
                if ($status == 'Done Repair Submitted') $stats['done_submitted']++;
                
                if ($risk == 'High Risk') $stats['risk_high']++;
                if ($risk == 'Moderate Risk') $stats['risk_medium']++;
                if ($risk == 'Low Risk') $stats['risk_low']++;

                if (!isset($stats['team_performance'][$team])) {
                    $stats['team_performance'][$team] = ['total' => 0, 'completed' => 0];
                }
                $stats['team_performance'][$team]['total']++;
                if (strpos($status, 'Done') !== false) {
                    $stats['team_performance'][$team]['completed']++;
                }
            }
            echo json_encode($stats);

        } else {
            // Get all tickets
            echo json_encode($db->getAll());
        }
    } 
    
    elseif ($method === 'POST') {
        // Create new ticket
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            echo json_encode(['error' => 'Invalid input']);
            exit;
        }
        $id = $db->create($input);
        echo json_encode(['success' => true, 'ticket_id' => $id]);
    } 
    
    elseif ($method === 'PUT') {
        // Update ticket
        $input = json_decode(file_get_contents('php://input'), true);
        if (!isset($input['ticket_id'])) {
             echo json_encode(['error' => 'Ticket ID required']);
             exit;
        }
        $id = $input['ticket_id'];
        unset($input['ticket_id']); // Remove ID from data to update
        if ($db->update($id, $input)) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['error' => 'Update failed or ID not found']);
        }
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
