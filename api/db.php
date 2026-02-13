<?php

class CSVDatabase {
    private $file;
    private $config;
    private $headers;
    private $reverseMap;

    public function __construct($config) {
        $this->config = $config;
        $this->file = $config['csv_file_path'];
        
        if (!file_exists($this->file)) {
            // Attempt to create if it doesn't exist
            $fp = fopen($this->file, 'w');
            if ($fp) {
                fputcsv($fp, array_keys($this->config['column_map']));
                fclose($fp);
            } else {
                throw new Exception("Database file not found and could not be created at: " . $this->file);
            }
        }
        
        $this->headers = $this->getHeaders();
        // Create a reverse map: system_key => csv_header
        $this->reverseMap = array_flip($this->config['column_map']);
    }

    private function getHeaders() {
        if (($handle = fopen($this->file, "r")) !== FALSE) {
            $headers = fgetcsv($handle);
            fclose($handle);
            // Remove BOM if present
            if (isset($headers[0])) {
                $headers[0] = preg_replace('/^\xEF\xBB\xBF/', '', $headers[0]); 
            }
            return $headers;
        }
        return [];
    }

    public function getAll() {
        $data = [];
        $map = $this->config['column_map'];
        
        if (($handle = fopen($this->file, "r")) !== FALSE) {
            $headers = fgetcsv($handle);
            
            // Clean headers for mapping
            $cleanHeaders = array_map(function($h) {
                return trim(preg_replace('/^\xEF\xBB\xBF/', '', $h));
            }, $headers);

            while (($row = fgetcsv($handle)) !== FALSE) {
                if (count($cleanHeaders) == count($row)) {
                    $rawRow = array_combine($cleanHeaders, $row);
                    $mappedRow = [];
                    
                    // Convert CSV headers to System keys
                    foreach ($rawRow as $csvKey => $value) {
                        if (isset($map[$csvKey])) {
                            $mappedRow[$map[$csvKey]] = $value;
                        } else {
                            // Keep unmapped columns? Optional.
                            // $mappedRow[$csvKey] = $value; 
                        }
                    }
                    
                    // Ensure ID is present for logic
                    if (isset($mappedRow['ticket_id'])) {
                        $data[] = $mappedRow;
                    }
                }
            }
            fclose($handle);
        }
        return $data;
    }

    public function create($newData) {
        $rows = $this->getAll();
        
        // Auto-increment ID logic
        if (empty($newData['ticket_id'])) {
            $maxId = 0;
            foreach ($rows as $row) {
                if (isset($row['ticket_id']) && (int)$row['ticket_id'] > $maxId) {
                    $maxId = (int)$row['ticket_id'];
                }
            }
            $newData['ticket_id'] = $maxId + 1;
        }

        // Prepare row for CSV
        $entry = [];
        foreach ($this->headers as $header) {
            // Find system key for this CSV header
            $systemKey = isset($this->config['column_map'][$header]) ? $this->config['column_map'][$header] : null;
            
            if ($systemKey && isset($newData[$systemKey])) {
                $entry[] = $newData[$systemKey];
            } else {
                $entry[] = '';
            }
        }

        $fp = fopen($this->file, 'a');
        fputcsv($fp, $entry);
        fclose($fp);
        return $newData['ticket_id'];
    }

    public function update($id, $updatedData) {
        $allData = $this->getAll(); // Got system keys
        $found = false;
        
        // 1. Read raw again to preserve unmapped columns if any
        // However, for simplicity and consistency, we regenerate based on config
        // A safer approach for "Master Files" is to read all, modify specific index, write all.
        
        $rawRows = [];
        $headers = [];
        
        if (($handle = fopen($this->file, "r")) !== FALSE) {
            $headers = fgetcsv($handle);
             // Clean headers
            $cleanHeaders = array_map(function($h) {
                return trim(preg_replace('/^\xEF\xBB\xBF/', '', $h));
            }, $headers);
            
            while (($row = fgetcsv($handle)) !== FALSE) {
                if (count($cleanHeaders) == count($row)) {
                    $rawRows[] = array_combine($cleanHeaders, $row);
                }
            }
            fclose($handle);
        }

        // 2. Modify
        foreach ($rawRows as &$row) {
            // Check ID using the map
            $idColumn = array_search('ticket_id', $this->config['column_map']); // e.g. "Ticket ID"
            
            if (isset($row[$idColumn]) && $row[$idColumn] == $id) {
                $found = true;
                foreach ($updatedData as $sysKey => $val) {
                    // Find CSV header for this system key
                    $csvHeader = array_search($sysKey, $this->config['column_map']);
                    if ($csvHeader && array_key_exists($csvHeader, $row)) {
                        $row[$csvHeader] = $val;
                    }
                }
                break; // Stop after updating
            }
        }

        if ($found) {
            $fp = fopen($this->file, 'w');
            fputcsv($fp, $headers);
            foreach ($rawRows as $row) {
                // Ensure order matches headers
                $writeRow = [];
                foreach ($headers as $h) {
                    // Handle BOM in key matching if strict, but we use values from read
                    // We need to match $h to keys in $row carefully
                    // $row keys are from $cleanHeaders. $headers has original.
                    // Let's rely on $cleanHeaders logic or just values if order preserved?
                    // Safe way:
                     $cleanH = trim(preg_replace('/^\xEF\xBB\xBF/', '', $h));
                     $writeRow[] = isset($row[$cleanH]) ? $row[$cleanH] : '';
                }
                fputcsv($fp, $writeRow);
            }
            fclose($fp);
            return true;
        }
        return false;
    }
}
?>