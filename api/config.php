<?php
// SYSTEM CONFIGURATION
// Path relative to this file so the correct tickets.csv is always used
$baseDir = dirname(__DIR__);

return [
    'csv_file_path' => $baseDir . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'tickets.csv',

    // COLUMN MAPPING
    // Map your spreadsheet headers (left) to the system's internal names (right)
    // Format: 'Your Header Name' => 'system_variable'
    'column_map' => [
        'Ticket ID' => 'ticket_id',
        'Date Created' => 'date_created',
        'Customer / Unit Name' => 'customer_name',
        'Repair Description' => 'description',
        'Repair Status' => 'status',
        'Risk Level' => 'risk_level',
        'Repair Group / Team' => 'team',
        'Assigned Technician' => 'technician',
        'Date Started' => 'date_started',
        'Date Completed' => 'date_completed',
        'Remarks' => 'remarks'
    ]
];
?>
