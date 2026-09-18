
CREATE TABLE 'courses' (
	'code' text PRIMARY KEY,
	'level' text NOT NULL,
	'title' text NOT NULL, 
	'school' text NOT NULL,
	'credits' text NOT NULL,
	'program' text NOT NULL, 
	'program_name' text NOT NULL,
	'prerequisites' jsonb DEFAULT '[]'::jsonb
	'metadata' jsonb; 
);

