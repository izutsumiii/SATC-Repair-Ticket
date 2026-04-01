<?php
// SYSTEM CONFIGURATION
// Path relative to this file so the correct tickets.csv is always used
$baseDir = dirname(__DIR__);

return [
    // Google Apps Script web app URL (Deploy → Web app → copy /exec). One URL only, must start with https://
    'gas_webapp_url' => 'https://script.google.com/macros/s/AKfycbzDFhgdamIhaqrybO0HA37mZ2Z5YC7sN5EvbPQ3tSLgP5Sh5l_9AxFtKWFDFqfl3PpmGA/exec',

    'csv_file_path' => $baseDir . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'tickets.csv',

    // COLUMN MAPPINGss
    // Map your spreadsheet headers (left) to the system's internal names (right)
    // Format: 'Your Header Name' => 'system_variable'
    'column_map' => [
        'Ticket ID' => 'ticket_id',
        'Date Created' => 'date_created',
        'Customer / Unit Name' => 'customer_name',
        'Repair Description' => 'description', 
        'Issue' => 'issue',
        'Contact Number' => 'contact_num',
        'Repair Status' => 'status',
        'Risk Level' => 'risk_level',
        'Repair Group / Team' => 'team',
        'Assigned Technician' => 'technician',
        'Date Started' => 'date_started',
        'DATE 1ST DISPATCH' => 'first_dispatch',
        'Date 1st Dispatch' => 'first_dispatch',
        '1st Dispatch' => 'first_dispatch',
        'Date Completed' => 'date_completed',
        'Remarks' => 'remarks'
    ]
];
?>
