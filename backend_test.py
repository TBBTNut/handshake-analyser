#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Modem Emulator
Tests all endpoints defined in the review request
"""

import requests
import json
import base64
import time
from typing import Dict, List, Any
import sys

# Base URL from frontend environment
BASE_URL = "https://handshake-analyzer.preview.emergentagent.com/api"

class ModemEmulatorTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.session_id = None
        self.test_results = []
        
    def log_test_result(self, test_name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test results for reporting"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "response_data": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if not success and response_data:
            print(f"   Response: {response_data}")
        print()

    def test_root_endpoint(self):
        """Test GET /api/ - Root endpoint"""
        try:
            response = self.session.get(f"{self.base_url}/")
            
            if response.status_code == 200:
                data = response.json()
                expected = {"message": "Modem Emulator API", "version": "1.0"}
                
                if data == expected:
                    self.log_test_result(
                        "Root Endpoint",
                        True,
                        f"Returned correct response: {data}"
                    )
                else:
                    self.log_test_result(
                        "Root Endpoint",
                        False,
                        f"Incorrect response. Expected: {expected}, Got: {data}",
                        data
                    )
            else:
                self.log_test_result(
                    "Root Endpoint",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
        except Exception as e:
            self.log_test_result(
                "Root Endpoint",
                False,
                f"Exception: {str(e)}"
            )

    def test_protocols_endpoint(self):
        """Test GET /api/protocols - Get supported modem protocols"""
        try:
            response = self.session.get(f"{self.base_url}/protocols")
            
            if response.status_code == 200:
                data = response.json()
                
                if "protocols" in data:
                    protocols = data["protocols"]
                    
                    # Check if we have 4 protocols
                    if len(protocols) == 4:
                        # Verify required protocols exist
                        protocol_names = [p["name"] for p in protocols]
                        expected_names = ["V.90", "V.92", "V.34", "V.32bis"]
                        
                        if all(name in protocol_names for name in expected_names):
                            # Verify each protocol has required fields
                            all_valid = True
                            for protocol in protocols:
                                required_fields = ["name", "speed", "description"]
                                if not all(field in protocol for field in required_fields):
                                    all_valid = False
                                    break
                            
                            if all_valid:
                                self.log_test_result(
                                    "Protocols Endpoint",
                                    True,
                                    f"All 4 protocols found with required fields: {protocol_names}"
                                )
                            else:
                                self.log_test_result(
                                    "Protocols Endpoint",
                                    False,
                                    "Some protocols missing required fields (name, speed, description)",
                                    data
                                )
                        else:
                            self.log_test_result(
                                "Protocols Endpoint",
                                False,
                                f"Missing expected protocols. Found: {protocol_names}, Expected: {expected_names}",
                                data
                            )
                    else:
                        self.log_test_result(
                            "Protocols Endpoint",
                            False,
                            f"Expected 4 protocols, got {len(protocols)}",
                            data
                        )
                else:
                    self.log_test_result(
                        "Protocols Endpoint",
                        False,
                        "Response missing 'protocols' field",
                        data
                    )
            else:
                self.log_test_result(
                    "Protocols Endpoint",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
        except Exception as e:
            self.log_test_result(
                "Protocols Endpoint",
                False,
                f"Exception: {str(e)}"
            )

    def test_get_isp_numbers(self):
        """Test GET /api/isp-numbers - Get ISP phone numbers"""
        try:
            response = self.session.get(f"{self.base_url}/isp-numbers")
            
            if response.status_code == 200:
                data = response.json()
                
                if isinstance(data, list) and len(data) > 0:
                    # Check if we have the expected ISPs
                    isp_names = [isp["name"] for isp in data]
                    expected_isps = ["AOL", "NetZero", "EarthLink"]
                    
                    if all(name in isp_names for name in expected_isps):
                        # Verify each ISP has required fields
                        required_fields = ["id", "name", "phone_number", "country", "active", "created_at"]
                        all_valid = True
                        
                        for isp in data:
                            if not all(field in isp for field in required_fields):
                                all_valid = False
                                break
                        
                        if all_valid:
                            self.log_test_result(
                                "Get ISP Numbers",
                                True,
                                f"Found {len(data)} ISPs with all required fields. ISPs: {isp_names[:5]}..."
                            )
                        else:
                            self.log_test_result(
                                "Get ISP Numbers",
                                False,
                                "Some ISPs missing required fields (id, name, phone_number, country, active, created_at)",
                                data[:2]  # Show first 2 for debugging
                            )
                    else:
                        self.log_test_result(
                            "Get ISP Numbers",
                            False,
                            f"Missing expected ISPs. Found: {isp_names}, Expected at least: {expected_isps}",
                            data[:3]
                        )
                else:
                    self.log_test_result(
                        "Get ISP Numbers",
                        False,
                        "Response is not a list or is empty",
                        data
                    )
            else:
                self.log_test_result(
                    "Get ISP Numbers",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
        except Exception as e:
            self.log_test_result(
                "Get ISP Numbers",
                False,
                f"Exception: {str(e)}"
            )

    def test_create_isp_number(self):
        """Test POST /api/isp-numbers - Add custom ISP number"""
        try:
            test_isp = {
                "name": "Retro ISP Test",
                "phone_number": "555-1234",
                "country": "USA"
            }
            
            response = self.session.post(
                f"{self.base_url}/isp-numbers",
                json=test_isp,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required fields in response
                required_fields = ["id", "name", "phone_number", "country", "active", "created_at"]
                if all(field in data for field in required_fields):
                    # Verify the data matches what we sent
                    if (data["name"] == test_isp["name"] and
                        data["phone_number"] == test_isp["phone_number"] and
                        data["country"] == test_isp["country"]):
                        
                        self.log_test_result(
                            "Create ISP Number",
                            True,
                            f"Successfully created ISP with id: {data['id']}"
                        )
                    else:
                        self.log_test_result(
                            "Create ISP Number",
                            False,
                            f"Response data doesn't match input. Input: {test_isp}, Response: {data}",
                            data
                        )
                else:
                    self.log_test_result(
                        "Create ISP Number",
                        False,
                        f"Missing required fields in response. Required: {required_fields}",
                        data
                    )
            else:
                self.log_test_result(
                    "Create ISP Number",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
        except Exception as e:
            self.log_test_result(
                "Create ISP Number",
                False,
                f"Exception: {str(e)}"
            )

    def test_dial_endpoint(self, protocol: str = "V.90"):
        """Test POST /api/dial - Initiate dial sequence"""
        try:
            dial_request = {
                "protocol": protocol,
                "phone_number": "1-800-827-6364",
                "isp_name": "AOL"
            }
            
            response = self.session.post(
                f"{self.base_url}/dial",
                json=dial_request,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify required fields in response
                required_fields = ["session_id", "protocol", "phone_number", "stages", "dial_tone_base64", "estimated_duration"]
                if all(field in data for field in required_fields):
                    
                    # Store session_id for later tests
                    if self.session_id is None:
                        self.session_id = data["session_id"]
                    
                    # Verify stages array
                    stages = data["stages"]
                    expected_stage_count = {
                        "V.90": 12,
                        "V.92": 13,
                        "V.34": 10,
                        "V.32bis": 8
                    }
                    
                    if len(stages) == expected_stage_count.get(protocol, 12):
                        # Verify each stage has required fields
                        stage_fields = ["stage", "name", "description", "frequency", "duration", "audio_base64"]
                        all_stages_valid = True
                        
                        for stage in stages:
                            if not all(field in stage for field in stage_fields):
                                all_stages_valid = False
                                break
                        
                        if all_stages_valid:
                            # Verify audio data is present and looks like base64
                            dial_tone_valid = len(data["dial_tone_base64"]) > 100  # Should be substantial base64 string
                            stage_audio_valid = all(len(stage["audio_base64"]) > 50 for stage in stages)
                            
                            if dial_tone_valid and stage_audio_valid:
                                self.log_test_result(
                                    f"Dial Endpoint ({protocol})",
                                    True,
                                    f"Successfully initiated dial with {len(stages)} stages and audio data. Session: {data['session_id']}"
                                )
                            else:
                                self.log_test_result(
                                    f"Dial Endpoint ({protocol})",
                                    False,
                                    "Audio data missing or too short (dial_tone_base64 or stage audio_base64)",
                                    {"dial_tone_length": len(data["dial_tone_base64"]), "first_stage_audio_length": len(stages[0]["audio_base64"]) if stages else 0}
                                )
                        else:
                            self.log_test_result(
                                f"Dial Endpoint ({protocol})",
                                False,
                                f"Some stages missing required fields: {stage_fields}",
                                stages[:2] if len(stages) > 2 else stages
                            )
                    else:
                        self.log_test_result(
                            f"Dial Endpoint ({protocol})",
                            False,
                            f"Incorrect number of stages for {protocol}. Expected: {expected_stage_count.get(protocol, 12)}, Got: {len(stages)}",
                            {"stages_count": len(stages), "expected": expected_stage_count.get(protocol, 12)}
                        )
                else:
                    self.log_test_result(
                        f"Dial Endpoint ({protocol})",
                        False,
                        f"Missing required fields in response. Required: {required_fields}",
                        data
                    )
            else:
                self.log_test_result(
                    f"Dial Endpoint ({protocol})",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
        except Exception as e:
            self.log_test_result(
                f"Dial Endpoint ({protocol})",
                False,
                f"Exception: {str(e)}"
            )

    def test_invalid_protocol_dial(self):
        """Test POST /api/dial with invalid protocol - should return 400"""
        try:
            dial_request = {
                "protocol": "Invalid-Protocol",
                "phone_number": "1-800-827-6364",
                "isp_name": "AOL"
            }
            
            response = self.session.post(
                f"{self.base_url}/dial",
                json=dial_request,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 400:
                self.log_test_result(
                    "Invalid Protocol Dial",
                    True,
                    f"Correctly returned 400 error for invalid protocol"
                )
            else:
                self.log_test_result(
                    "Invalid Protocol Dial",
                    False,
                    f"Expected 400 error, got HTTP {response.status_code}: {response.text}",
                    response.text
                )
        except Exception as e:
            self.log_test_result(
                "Invalid Protocol Dial",
                False,
                f"Exception: {str(e)}"
            )

    def test_get_session(self):
        """Test GET /api/session/{session_id} - Get session details"""
        if not self.session_id:
            self.log_test_result(
                "Get Session",
                False,
                "No session_id available from previous dial test"
            )
            return
        
        try:
            response = self.session.get(f"{self.base_url}/session/{self.session_id}")
            
            if response.status_code == 200:
                data = response.json()
                
                # Verify session data contains expected fields
                expected_fields = ["session_id", "protocol", "phone_number", "started_at", "status"]
                if all(field in data for field in expected_fields):
                    if data["session_id"] == self.session_id:
                        self.log_test_result(
                            "Get Session",
                            True,
                            f"Successfully retrieved session data for {self.session_id}"
                        )
                    else:
                        self.log_test_result(
                            "Get Session",
                            False,
                            f"Session ID mismatch. Expected: {self.session_id}, Got: {data.get('session_id')}",
                            data
                        )
                else:
                    self.log_test_result(
                        "Get Session",
                        False,
                        f"Missing expected fields in session data. Expected: {expected_fields}",
                        data
                    )
            elif response.status_code == 404:
                self.log_test_result(
                    "Get Session",
                    False,
                    f"Session not found (404). Session ID: {self.session_id}",
                    response.text
                )
            else:
                self.log_test_result(
                    "Get Session",
                    False,
                    f"HTTP {response.status_code}: {response.text}",
                    response.text
                )
        except Exception as e:
            self.log_test_result(
                "Get Session",
                False,
                f"Exception: {str(e)}"
            )

    def test_invalid_session(self):
        """Test GET /api/session/{invalid_id} - should return 404"""
        try:
            fake_session_id = "00000000-0000-0000-0000-000000000000"
            response = self.session.get(f"{self.base_url}/session/{fake_session_id}")
            
            if response.status_code == 404:
                self.log_test_result(
                    "Invalid Session Test",
                    True,
                    f"Correctly returned 404 for invalid session ID"
                )
            else:
                self.log_test_result(
                    "Invalid Session Test",
                    False,
                    f"Expected 404, got HTTP {response.status_code}: {response.text}",
                    response.text
                )
        except Exception as e:
            self.log_test_result(
                "Invalid Session Test",
                False,
                f"Exception: {str(e)}"
            )

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("=== MODEM EMULATOR API COMPREHENSIVE TESTING ===")
        print(f"Base URL: {self.base_url}")
        print("=" * 60)
        
        # Core endpoint tests
        self.test_root_endpoint()
        self.test_protocols_endpoint()
        self.test_get_isp_numbers()
        self.test_create_isp_number()
        
        # Dial tests for different protocols
        self.test_dial_endpoint("V.90")  # This will set session_id
        self.test_dial_endpoint("V.92")
        self.test_dial_endpoint("V.34")
        self.test_dial_endpoint("V.32bis")
        
        # Error handling tests
        self.test_invalid_protocol_dial()
        
        # Session tests
        self.test_get_session()
        self.test_invalid_session()
        
        # Generate summary
        self.generate_summary()

    def generate_summary(self):
        """Generate test summary"""
        print("=" * 60)
        print("=== TEST SUMMARY ===")
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed}")
        print(f"Failed: {total - passed}")
        print(f"Success Rate: {(passed/total)*100:.1f}%")
        
        if total - passed > 0:
            print("\n=== FAILED TESTS ===")
            for result in self.test_results:
                if not result["success"]:
                    print(f"❌ {result['test']}: {result['details']}")
        
        print("\n=== CRITICAL CHECKS ===")
        
        # Check for critical functionality
        dial_tests = [r for r in self.test_results if "Dial Endpoint" in r["test"] and r["success"]]
        protocol_test = [r for r in self.test_results if r["test"] == "Protocols Endpoint" and r["success"]]
        isp_test = [r for r in self.test_results if r["test"] == "Get ISP Numbers" and r["success"]]
        
        print(f"✓ Protocol Support: {'WORKING' if protocol_test else 'FAILED'}")
        print(f"✓ ISP Database: {'WORKING' if isp_test else 'FAILED'}")
        print(f"✓ Dial Functionality: {'WORKING' if len(dial_tests) >= 2 else 'FAILED'}")
        print(f"✓ Audio Generation: {'WORKING' if dial_tests else 'FAILED'}")
        
        return passed, total

if __name__ == "__main__":
    tester = ModemEmulatorTester()
    tester.run_all_tests()