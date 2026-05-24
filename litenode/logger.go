package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"
)

type logLevel int

const (
	levelDebug logLevel = iota
	levelInfo
	levelWarn
	levelError
)

type logger struct {
	level logLevel
}

func newLogger() *logger {
	lvl := levelInfo
	if os.Getenv("LOG_LEVEL") == "debug" {
		lvl = levelDebug
	}
	return &logger{level: lvl}
}

func (l *logger) log(level, msg string, args ...interface{}) {
	entry := map[string]interface{}{
		"ts":  time.Now().UTC().Format(time.RFC3339Nano),
		"lvl": level,
		"msg": fmt.Sprintf(msg, args...),
	}
	data, _ := json.Marshal(entry)
	fmt.Fprintf(os.Stdout, "%s\n", data)
}

func (l *logger) Debugf(msg string, args ...interface{}) {
	if l.level <= levelDebug {
		l.log("DEBUG", msg, args...)
	}
}
func (l *logger) Infof(msg string, args ...interface{}) {
	if l.level <= levelInfo {
		l.log("INFO", msg, args...)
	}
}
func (l *logger) Warnf(msg string, args ...interface{}) {
	if l.level <= levelWarn {
		l.log("WARN", msg, args...)
	}
}
func (l *logger) Errorf(msg string, args ...interface{}) {
	l.log("ERROR", msg, args...)
}
